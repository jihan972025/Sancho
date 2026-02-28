import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Plus, Send, HelpCircle, Sparkles, Loader2, CornerDownLeft, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useWorkflowAgentStore } from '../../../stores/workflowAgentStore'
import { useChatStore } from '../../../stores/chatStore'
import { getServiceDef, serviceSampleKeys } from '../agentServiceDefs'
import { aiAgentBuild } from '../../../api/client'
import { useTranslation } from 'react-i18next'
import type { AgentNodeDef, AgentEdge, PortSide } from '../../../types'

const CHATAPP_IDS = new Set(['whatsapp', 'telegram', 'matrix', 'slack_app'])
const NODE_WIDTH = 240
const NODE_PORT_SIZE = 10
const MIN_SCALE = 0.25
const MAX_SCALE = 2.5

// ── Port position helpers ──

function getPortPos(node: AgentNodeDef, side: PortSide, nodeHeight: number): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: node.x + NODE_WIDTH / 2, y: node.y }
    case 'bottom': return { x: node.x + NODE_WIDTH / 2, y: node.y + nodeHeight }
    case 'left':   return { x: node.x, y: node.y + nodeHeight / 2 }
    case 'right':  return { x: node.x + NODE_WIDTH, y: node.y + nodeHeight / 2 }
  }
}

// ── Smart bezier path: adapts control points based on port directions ──

function bezierPath(sx: number, sy: number, sSide: PortSide, ex: number, ey: number, eSide: PortSide): string {
  const dist = Math.max(60, Math.hypot(ex - sx, ey - sy) * 0.35)

  // Control point offset direction per port side
  const cpDir: Record<PortSide, { dx: number; dy: number }> = {
    top:    { dx: 0, dy: -1 },
    bottom: { dx: 0, dy:  1 },
    left:   { dx: -1, dy: 0 },
    right:  { dx:  1, dy: 0 },
  }

  const sd = cpDir[sSide]
  const ed = cpDir[eSide]

  const cp1x = sx + sd.dx * dist
  const cp1y = sy + sd.dy * dist
  const cp2x = ex + ed.dx * dist
  const cp2y = ey + ed.dy * dist

  return `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`
}

// ── Main component ──

export default function WorkflowCanvas() {
  const { t } = useTranslation()
  const {
    editingAgent, addNode, removeNode, updateNodePrompt,
    updateNodePosition, addEdge, removeEdge, applyAiBuild,
  } = useWorkflowAgentStore()
  const nodes = editingAgent.nodes
  const edges = editingAgent.edges

  // Viewport state
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  // Node drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // Edge connection state: track which node+port we're connecting from
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; port: PortSide } | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Selection state
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Node heights (tracked per node for accurate port positioning)
  const nodeHeightsRef = useRef<Record<string, number>>({})

  // Drop highlight
  const [dragOverCanvas, setDragOverCanvas] = useState(false)

  // Help popover
  const [helpOpenFor, setHelpOpenFor] = useState<string | null>(null)
  const helpRef = useRef<HTMLDivElement>(null)

  // AI chat input
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const defaultModel = useChatStore((s) => s.selectedModel)

  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Keyboard handler ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectingFrom(null)
        setSelectedEdgeId(null)
        setSelectedNodeId(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        removeEdge(selectedEdgeId)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId, removeEdge])

  // Close help popup on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpenFor(null)
      }
    }
    if (helpOpenFor) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [helpOpenFor])

  // ── Coordinate conversion ──
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - viewOffset.x) / scale,
        y: (clientY - rect.top - viewOffset.y) / scale,
      }
    },
    [viewOffset, scale]
  )

  // ── Pan ──
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-canvas-bg]')) return
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX - viewOffset.x, y: e.clientY - viewOffset.y }
      setSelectedEdgeId(null)
      setSelectedNodeId(null)
      if (connectingFrom) setConnectingFrom(null)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
    if (isPanning) {
      setViewOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
      return
    }
    if (draggingNodeId) {
      const pos = clientToCanvas(e.clientX, e.clientY)
      updateNodePosition(
        draggingNodeId,
        pos.x - dragOffsetRef.current.x,
        pos.y - dragOffsetRef.current.y
      )
      return
    }
  }

  const handleCanvasMouseUp = () => {
    setIsPanning(false)
    if (draggingNodeId) setDraggingNodeId(null)
  }

  // ── Zoom ──
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.92 : 1.08
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta))
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const scaleRatio = newScale / scale
      setViewOffset({
        x: cx - scaleRatio * (cx - viewOffset.x),
        y: cy - scaleRatio * (cy - viewOffset.y),
      })
      setScale(newScale)
    },
    [scale, viewOffset]
  )

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Node drag ──
  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const pos = clientToCanvas(e.clientX, e.clientY)
    dragOffsetRef.current = { x: pos.x - node.x, y: pos.y - node.y }
    setDraggingNodeId(nodeId)
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }

  // ── Port interactions (supports all 4 sides) ──
  const handlePortDown = (e: React.MouseEvent, nodeId: string, port: PortSide) => {
    e.stopPropagation()
    setConnectingFrom({ nodeId, port })
  }

  const handlePortUp = (e: React.MouseEvent, nodeId: string, port: PortSide) => {
    e.stopPropagation()
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      addEdge(connectingFrom.nodeId, nodeId, connectingFrom.port, port)
    }
    setConnectingFrom(null)
  }

  // ── Drop from palette ──
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverCanvas(false)
    const serviceData = e.dataTransfer.getData('application/sancho-service')
    if (serviceData) {
      const { serviceId, serviceType } = JSON.parse(serviceData)
      const pos = clientToCanvas(e.clientX, e.clientY)
      addNode(serviceId, serviceType, pos.x - NODE_WIDTH / 2, pos.y - 40)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dragOverCanvas) setDragOverCanvas(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (canvasRef.current && !canvasRef.current.contains(e.relatedTarget as Node)) {
      setDragOverCanvas(false)
    }
  }

  // ── Fit to view ──
  const fitToView = () => {
    if (nodes.length === 0) { setViewOffset({ x: 0, y: 0 }); setScale(1); return }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...nodes.map((n) => n.x))
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_WIDTH))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxY = Math.max(...nodes.map((n) => n.y + (nodeHeightsRef.current[n.id] || 120)))
    const contentW = maxX - minX + 80
    const contentH = maxY - minY + 80
    const newScale = Math.min(Math.max(Math.min(rect.width / contentW, rect.height / contentH), MIN_SCALE), 1.2)
    setScale(newScale)
    setViewOffset({
      x: rect.width / 2 - ((minX + maxX) / 2) * newScale,
      y: rect.height / 2 - ((minY + maxY) / 2) * newScale,
    })
  }

  // ── AI build ──
  const handleAiBuild = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || aiLoading) return
    setAiLoading(true)
    setAiError('')
    try {
      const model = editingAgent.model || defaultModel || ''
      const result = await aiAgentBuild(prompt, model)
      applyAiBuild(result)
      setAiPrompt('')
    } catch (err: any) {
      setAiError(err.message || t('agent.aiBuildError'))
    } finally {
      setAiLoading(false)
    }
  }

  const getNodeHeight = (nodeId: string) => nodeHeightsRef.current[nodeId] || 120

  // ── Render ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Canvas viewport */}
      <div
        ref={canvasRef}
        className={`flex-1 relative overflow-hidden ${
          isPanning ? 'cursor-grabbing' : connectingFrom ? 'cursor-crosshair' : 'cursor-grab'
        } ${dragOverCanvas ? 'ring-2 ring-inset ring-angel-500/30' : ''}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => { setIsPanning(false); if (draggingNodeId) setDraggingNodeId(null) }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-canvas-bg
        style={{
          backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
          backgroundSize: `${20 * scale}px ${20 * scale}px`,
          backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px`,
        }}
      >
        {/* Transform container */}
        <div
          style={{
            transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0, left: 0, width: 0, height: 0,
          }}
        >
          {/* SVG edge layer */}
          <svg className="absolute overflow-visible pointer-events-none" style={{ top: 0, left: 0, width: 1, height: 1 }}>
            {edges.map((edge) => (
              <BezierEdge
                key={edge.id}
                edge={edge}
                nodes={nodes}
                getNodeHeight={getNodeHeight}
                selected={selectedEdgeId === edge.id}
                onClick={(id) => { setSelectedEdgeId(id === selectedEdgeId ? null : id); setSelectedNodeId(null) }}
              />
            ))}
            {/* Draft edge while connecting */}
            {connectingFrom && (
              <DraftEdge
                sourceNode={nodes.find((n) => n.id === connectingFrom.nodeId)!}
                sourcePort={connectingFrom.port}
                getNodeHeight={getNodeHeight}
                mouseX={(mousePos.x - (canvasRef.current?.getBoundingClientRect().left ?? 0) - viewOffset.x) / scale}
                mouseY={(mousePos.y - (canvasRef.current?.getBoundingClientRect().top ?? 0) - viewOffset.y) / scale}
              />
            )}
          </svg>

          {/* Node layer */}
          {nodes.map((node) => (
            <CanvasNode
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              connecting={connectingFrom !== null}
              onDragStart={handleNodeDragStart}
              onPortDown={handlePortDown}
              onPortUp={handlePortUp}
              onRemove={removeNode}
              onPromptChange={updateNodePrompt}
              onHeightChange={(id, h) => { nodeHeightsRef.current[id] = h }}
              helpOpenFor={helpOpenFor}
              setHelpOpenFor={setHelpOpenFor}
              helpRef={helpRef}
              t={t}
            />
          ))}
        </div>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center max-w-xs">
              <Plus size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">{t('agent.dragHint')}</p>
            </div>
          </div>
        )}

        {/* Zoom toolbar */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-0.5 bg-slate-800/90 rounded-lg border border-slate-700/50 px-1 py-0.5 backdrop-blur-sm">
          <button onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.2))} className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors" title="Zoom in"><ZoomIn size={13} /></button>
          <span className="text-[10px] text-slate-500 w-9 text-center select-none">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.max(MIN_SCALE, s * 0.8))} className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors" title="Zoom out"><ZoomOut size={13} /></button>
          <div className="w-px h-4 bg-slate-700 mx-0.5" />
          <button onClick={fitToView} className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors" title="Fit to view"><Maximize2 size={13} /></button>
        </div>
      </div>

      {/* AI Chat Input Bar */}
      <div className="border-t border-slate-700 bg-slate-900/80 backdrop-blur-sm px-3 py-2.5">
        {aiError && <div className="text-[11px] text-red-400 mb-1.5 px-1">{aiError}</div>}
        <div className="flex items-center gap-2">
          <Sparkles size={16} className={`shrink-0 ${aiLoading ? 'text-angel-400 animate-pulse' : 'text-angel-500/60'}`} />
          <input
            type="text"
            value={aiLoading ? t('agent.aiBuilding') : aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleAiBuild() } }}
            disabled={aiLoading}
            placeholder={t('agent.aiPlaceholder')}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button onClick={handleAiBuild} disabled={aiLoading || !aiPrompt.trim()} className="shrink-0 p-1.5 rounded-lg bg-angel-600 hover:bg-angel-700 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors" title="Enter">
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Port dot sub-component ──

const portBaseClass = 'rounded-full border-2 transition-colors cursor-crosshair'
const portNormalClass = 'border-slate-600 bg-slate-800 hover:border-angel-400 hover:bg-angel-500/20'
const portActiveClass = 'border-angel-400 bg-angel-500/30'

function PortDot({
  side,
  connecting,
  nodeId,
  onPortDown,
  onPortUp,
}: {
  side: PortSide
  connecting: boolean
  nodeId: string
  onPortDown: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onPortUp: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
}) {
  // Position styles per side
  const posStyle: React.CSSProperties = (() => {
    const half = NODE_PORT_SIZE / 2
    switch (side) {
      case 'top':    return { position: 'absolute', top: -half, left: '50%', marginLeft: -half }
      case 'bottom': return { position: 'absolute', bottom: -half, left: '50%', marginLeft: -half }
      case 'left':   return { position: 'absolute', left: -half, top: '50%', marginTop: -half }
      case 'right':  return { position: 'absolute', right: -half, top: '50%', marginTop: -half }
    }
  })()

  return (
    <div
      className={`${portBaseClass} ${connecting ? portActiveClass : portNormalClass}`}
      style={{ ...posStyle, width: NODE_PORT_SIZE, height: NODE_PORT_SIZE, zIndex: 5 }}
      onMouseDown={(e) => onPortDown(e, nodeId, side)}
      onMouseUp={(e) => onPortUp(e, nodeId, side)}
    />
  )
}

// ── CanvasNode sub-component ──

interface CanvasNodeProps {
  node: AgentNodeDef
  selected: boolean
  connecting: boolean
  onDragStart: (e: React.MouseEvent, nodeId: string) => void
  onPortDown: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onPortUp: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onRemove: (nodeId: string) => void
  onPromptChange: (nodeId: string, prompt: string) => void
  onHeightChange: (nodeId: string, height: number) => void
  helpOpenFor: string | null
  setHelpOpenFor: (id: string | null) => void
  helpRef: React.RefObject<HTMLDivElement>
  t: (key: string) => string
}

function CanvasNode({
  node, selected, connecting,
  onDragStart, onPortDown, onPortUp,
  onRemove, onPromptChange, onHeightChange,
  helpOpenFor, setHelpOpenFor, helpRef, t,
}: CanvasNodeProps) {
  const svc = getServiceDef(node.serviceId)
  const cardRef = useRef<HTMLDivElement>(null)
  const isChatApp = CHATAPP_IDS.has(node.serviceId) || node.serviceType === 'chatapp'

  // Track height
  useEffect(() => {
    if (cardRef.current) {
      onHeightChange(node.id, cardRef.current.offsetHeight)
    }
  })

  if (!svc) return null
  const Icon = svc.icon

  return (
    <div
      className="absolute select-none"
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, zIndex: selected ? 10 : 1 }}
    >
      {/* Node card body (relative for port positioning) */}
      <div
        ref={cardRef}
        className={`relative border rounded-lg p-3 transition-all ${
          selected ? 'ring-2 ring-angel-500/50 ' : ''
        }${
          isChatApp
            ? 'bg-green-900/30 border-green-500/30 hover:border-green-400/50'
            : 'bg-slate-800/95 border-slate-700 hover:border-slate-600'
        }`}
        style={{ cursor: 'grab' }}
        onMouseDown={(e) => {
          const tag = (e.target as HTMLElement).tagName
          if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT') return
          onDragStart(e, node.id)
        }}
      >
        {/* 4 Ports: top, bottom, left, right */}
        <PortDot side="top" connecting={connecting} nodeId={node.id} onPortDown={onPortDown} onPortUp={onPortUp} />
        <PortDot side="bottom" connecting={connecting} nodeId={node.id} onPortDown={onPortDown} onPortUp={onPortUp} />
        <PortDot side="left" connecting={connecting} nodeId={node.id} onPortDown={onPortDown} onPortUp={onPortUp} />
        <PortDot side="right" connecting={connecting} nodeId={node.id} onPortDown={onPortDown} onPortUp={onPortUp} />

        {/* Node header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border shrink-0 ${svc.bgColor}`}>
              <Icon size={12} className={svc.color} />
              <span className="text-xs font-medium text-slate-200">{svc.name}</span>
            </div>
            {isChatApp && (
              <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                <Send size={9} />
                {t('agent.sendResult')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {/* Help icon with sample prompts */}
            <div className="relative" ref={helpOpenFor === node.id ? helpRef : undefined}>
              <button
                onClick={(e) => { e.stopPropagation(); setHelpOpenFor(helpOpenFor === node.id ? null : node.id) }}
                onMouseEnter={() => setHelpOpenFor(node.id)}
                className="p-1 rounded hover:bg-slate-700 transition-colors group"
                title={t('agent.samplePrompts')}
              >
                <HelpCircle size={12} className="text-slate-500 group-hover:text-angel-400 transition-colors" />
              </button>
              {helpOpenFor === node.id && (
                <div
                  onMouseLeave={() => setHelpOpenFor(null)}
                  className="absolute right-0 top-7 z-50 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2.5 animate-in fade-in"
                >
                  <div className="text-[10px] font-medium text-slate-400 mb-1.5 px-1">{t('agent.samplePrompts')}</div>
                  {(serviceSampleKeys[node.serviceId] || []).map((key, si) => {
                    const sample = t(key)
                    return (
                      <button
                        key={si}
                        onClick={(e) => { e.stopPropagation(); if (!isChatApp) onPromptChange(node.id, sample); setHelpOpenFor(null) }}
                        className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors mb-0.5 ${
                          isChatApp ? 'text-green-300/80 hover:bg-green-900/20' : 'text-slate-300 hover:bg-slate-700 hover:text-angel-300 cursor-pointer'
                        }`}
                      >
                        <span className="text-slate-500 mr-1">{si + 1}.</span>
                        {sample}
                      </button>
                    )
                  })}
                  {!isChatApp && (
                    <div className="text-[9px] text-slate-600 mt-1 px-1 border-t border-slate-700 pt-1">{t('agent.clickToApply')}</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id) }} className="p-1 rounded hover:bg-slate-700 transition-colors">
              <X size={12} className="text-slate-500 hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* Prompt input */}
        {isChatApp ? (
          <div className="text-[11px] text-green-400/70 bg-green-900/10 rounded px-2 py-1.5 border border-green-500/10">
            {t('agent.chatAppHint')}
          </div>
        ) : (
          <textarea
            value={node.prompt}
            onChange={(e) => onPromptChange(node.id, e.target.value)}
            placeholder={t('agent.nodePrompt')}
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 resize-none"
          />
        )}
      </div>
    </div>
  )
}

// ── BezierEdge sub-component ──

interface BezierEdgeProps {
  edge: AgentEdge
  nodes: AgentNodeDef[]
  getNodeHeight: (nodeId: string) => number
  selected: boolean
  onClick: (edgeId: string) => void
}

function BezierEdge({ edge, nodes, getNodeHeight, selected, onClick }: BezierEdgeProps) {
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)
  if (!sourceNode || !targetNode) return null

  const srcPort: PortSide = edge.sourcePort || 'bottom'
  const tgtPort: PortSide = edge.targetPort || 'top'
  const start = getPortPos(sourceNode, srcPort, getNodeHeight(sourceNode.id))
  const end = getPortPos(targetNode, tgtPort, getNodeHeight(targetNode.id))
  const d = bezierPath(start.x, start.y, srcPort, end.x, end.y, tgtPort)

  // Arrowhead rotation based on target port direction
  const arrowAngle: Record<PortSide, number> = { top: 180, bottom: 0, left: 90, right: -90 }
  const angle = arrowAngle[tgtPort]

  return (
    <g className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(edge.id) }}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        d={d}
        fill="none"
        stroke={selected ? '#f59e0b' : '#64748b'}
        strokeWidth={selected ? 2.5 : 2}
        strokeDasharray={selected ? '6 3' : 'none'}
        className="transition-colors"
      />
      {/* Arrow triangle at end */}
      <g transform={`translate(${end.x},${end.y}) rotate(${angle})`}>
        <polygon points="0,2 -4,-5 4,-5" fill={selected ? '#f59e0b' : '#64748b'} />
      </g>
    </g>
  )
}

// ── DraftEdge sub-component ──

interface DraftEdgeProps {
  sourceNode: AgentNodeDef
  sourcePort: PortSide
  getNodeHeight: (nodeId: string) => number
  mouseX: number
  mouseY: number
}

function DraftEdge({ sourceNode, sourcePort, getNodeHeight, mouseX, mouseY }: DraftEdgeProps) {
  if (!sourceNode) return null
  const start = getPortPos(sourceNode, sourcePort, getNodeHeight(sourceNode.id))

  // Guess the incoming target direction based on relative position
  const dx = mouseX - start.x
  const dy = mouseY - start.y
  let guessPort: PortSide
  if (Math.abs(dx) > Math.abs(dy)) {
    guessPort = dx > 0 ? 'left' : 'right'
  } else {
    guessPort = dy > 0 ? 'top' : 'bottom'
  }

  const d = bezierPath(start.x, start.y, sourcePort, mouseX, mouseY, guessPort)

  return (
    <path
      d={d}
      fill="none"
      stroke="#e89b18"
      strokeWidth={2}
      strokeDasharray="6 3"
      className="pointer-events-none"
      opacity={0.7}
    />
  )
}
