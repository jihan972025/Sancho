import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Plus, Send, HelpCircle, Sparkles, Loader2, CornerDownLeft, ZoomIn, ZoomOut, Maximize2, Code2, Copy, Check } from 'lucide-react'
import { useWorkflowAgentStore, autoLayoutNodes, autoLayoutGraph, autoCreateLinearEdges } from '../../../stores/workflowAgentStore'
import { useChatStore } from '../../../stores/chatStore'
import { getServiceDef, serviceSampleKeys } from '../agentServiceDefs'
import { aiAgentBuildStream } from '../../../api/client'
import { useTranslation } from 'react-i18next'
import type { AgentNodeDef, AgentEdge, PortSide, NodeType } from '../../../types'

const CHATAPP_IDS = new Set(['whatsapp', 'telegram', 'matrix', 'slack_app', 'discord'])
const NODE_WIDTH = 240
const COMPACT_WIDTH = 140
const NODE_PORT_SIZE = 10
const MIN_SCALE = 0.25
const MAX_SCALE = 2.5

// Control node type sets
const COMPACT_NODES = new Set<NodeType>(['fork', 'join', 'delay'])
const CONTROL_STYLES: Record<string, { bg: string; border: string; hoverBorder: string }> = {
  condition:  { bg: 'bg-amber-900/30',  border: 'border-amber-500/30',  hoverBorder: 'hover:border-amber-400/50' },
  fork:       { bg: 'bg-cyan-900/30',   border: 'border-cyan-500/30',   hoverBorder: 'hover:border-cyan-400/50' },
  join:       { bg: 'bg-cyan-900/30',   border: 'border-cyan-500/30',   hoverBorder: 'hover:border-cyan-400/50' },
  loop:       { bg: 'bg-purple-900/30', border: 'border-purple-500/30', hoverBorder: 'hover:border-purple-400/50' },
  delay:      { bg: 'bg-slate-800/70',  border: 'border-slate-600/30',  hoverBorder: 'hover:border-slate-500/50' },
  approval:   { bg: 'bg-amber-900/30',  border: 'border-amber-500/30',  hoverBorder: 'hover:border-amber-400/50' },
  subroute:   { bg: 'bg-indigo-900/30', border: 'border-indigo-500/30', hoverBorder: 'hover:border-indigo-400/50' },
}

// Edge type colors for labels
const EDGE_TYPE_COLORS: Record<string, { bg: string; text: string; stroke: string }> = {
  yes:   { bg: 'bg-emerald-600', text: 'text-white', stroke: '#10b981' },
  no:    { bg: 'bg-red-600',     text: 'text-white', stroke: '#ef4444' },
  error: { bg: 'bg-red-700',     text: 'text-white', stroke: '#b91c1c' },
  loop:  { bg: 'bg-purple-600',  text: 'text-white', stroke: '#9333ea' },
}

// ── Port position helpers ──

function getPortPos(node: AgentNodeDef, side: PortSide, nodeHeight: number): { x: number; y: number } {
  const w = COMPACT_NODES.has(node.nodeType) ? COMPACT_WIDTH : NODE_WIDTH
  switch (side) {
    case 'top':    return { x: node.x + w / 2, y: node.y }
    case 'bottom': return { x: node.x + w / 2, y: node.y + nodeHeight }
    case 'left':   return { x: node.x, y: node.y + nodeHeight / 2 }
    case 'right':  return { x: node.x + w, y: node.y + nodeHeight / 2 }
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

// ── Build JSON for viewer ──

function buildAgentJson(agent: { name: string; nodes: AgentNodeDef[]; edges: AgentEdge[]; schedule: any; model: string }) {
  const data = {
    name: agent.name || 'Untitled Agent',
    nodes: agent.nodes.map((n) => {
      const base: Record<string, any> = {
        serviceId: n.serviceId,
        serviceType: n.serviceType,
        prompt: n.prompt,
      }
      if (n.nodeType && n.nodeType !== 'service') {
        base.nodeType = n.nodeType
      }
      if (n.config && Object.keys(n.config).length > 0) {
        base.config = n.config
      }
      if (n.outputVariable) {
        base.outputVariable = n.outputVariable
      }
      return base
    }),
    edges: agent.edges.map((e) => {
      const base: Record<string, any> = {
        source: e.source,
        target: e.target,
      }
      if (e.edgeType) {
        base.edgeType = e.edgeType
      }
      return base
    }),
    schedule: agent.schedule,
    model: agent.model || undefined,
  }
  return JSON.stringify(data, null, 2)
}

// ── Main component ──

export default function WorkflowCanvas() {
  const { t } = useTranslation()
  const {
    editingAgent, addNode, removeNode, updateNodePrompt,
    updateNodePosition, addEdge, removeEdge, applyAiBuild,
    updateNodeConfig, updateNodeOutputVariable, updateEdgeType,
    aiBuildStreaming, aiBuildStreamContent, aiBuildError,
    setAiBuildStreaming, appendAiBuildContent, setAiBuildError, resetAiBuildStream,
    executionStates,
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
  const defaultModel = useChatStore((s) => s.selectedModel)

  // JSON viewer
  const [showJson, setShowJson] = useState(false)
  const [jsonCopied, setJsonCopied] = useState(false)

  // Streaming auto-scroll ref
  const streamRef = useRef<HTMLDivElement>(null)

  // Animation state for AI build
  const [nodeAnimPhase, setNodeAnimPhase] = useState<Record<string, 'fade-in' | 'move' | 'done'>>({})
  const [edgeAnimating, setEdgeAnimating] = useState<Set<string>>(new Set())

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
      const { serviceId, serviceType, nodeType } = JSON.parse(serviceData)
      const pos = clientToCanvas(e.clientX, e.clientY)
      const w = COMPACT_NODES.has(nodeType as NodeType) ? COMPACT_WIDTH : NODE_WIDTH
      addNode(serviceId, serviceType, pos.x - w / 2, pos.y - 40, nodeType)
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
    const maxX = Math.max(...nodes.map((n) => n.x + (COMPACT_NODES.has(n.nodeType) ? COMPACT_WIDTH : NODE_WIDTH)))
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

  // Fit to view reading directly from store (works in async callbacks where closure nodes are stale)
  const fitToViewFromStore = useCallback(() => {
    const currentNodes = useWorkflowAgentStore.getState().editingAgent.nodes
    if (currentNodes.length === 0) { setViewOffset({ x: 0, y: 0 }); setScale(1); return }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...currentNodes.map((n) => n.x))
    const maxX = Math.max(...currentNodes.map((n) => n.x + (COMPACT_NODES.has(n.nodeType) ? COMPACT_WIDTH : NODE_WIDTH)))
    const minY = Math.min(...currentNodes.map((n) => n.y))
    const maxY = Math.max(...currentNodes.map((n) => n.y + (nodeHeightsRef.current[n.id] || 120)))
    const contentW = maxX - minX + 80
    const contentH = maxY - minY + 80
    const newScale = Math.min(Math.max(Math.min(rect.width / contentW, rect.height / contentH), MIN_SCALE), 1.2)
    setScale(newScale)
    setViewOffset({
      x: rect.width / 2 - ((minX + maxX) / 2) * newScale,
      y: rect.height / 2 - ((minY + maxY) / 2) * newScale,
    })
  }, [])

  // ── AI build (streaming with progressive canvas build) ──
  const progressiveStateRef = useRef<{
    nodeCount: number
    edgeCount: number
    fullText: string
  }>({ nodeCount: 0, edgeCount: 0, fullText: '' })

  // Extract top-level JSON objects from a string using brace counting (handles nested {})
  const extractJsonObjects = (text: string, startAfter: string): any[] => {
    const idx = text.indexOf(startAfter)
    if (idx === -1) return []
    const results: any[] = []
    let pos = idx + startAfter.length
    // skip to first [
    while (pos < text.length && text[pos] !== '[') pos++
    if (pos >= text.length) return results
    pos++ // skip [

    while (pos < text.length) {
      // skip whitespace and commas
      while (pos < text.length && (text[pos] === ' ' || text[pos] === '\n' || text[pos] === '\r' || text[pos] === '\t' || text[pos] === ',')) pos++
      if (pos >= text.length || text[pos] === ']') break
      if (text[pos] !== '{') { pos++; continue }
      // found object start — count braces
      let depth = 0
      const objStart = pos
      let inString = false
      let escaped = false
      while (pos < text.length) {
        const ch = text[pos]
        if (escaped) { escaped = false; pos++; continue }
        if (ch === '\\' && inString) { escaped = true; pos++; continue }
        if (ch === '"') { inString = !inString; pos++; continue }
        if (!inString) {
          if (ch === '{') depth++
          else if (ch === '}') { depth--; if (depth === 0) { pos++; break } }
        }
        pos++
      }
      if (depth === 0) {
        try {
          results.push(JSON.parse(text.substring(objStart, pos)))
        } catch { /* incomplete */ }
      }
    }
    return results
  }

  // Progressive build: add newly discovered nodes/edges to canvas
  const tryProgressiveBuild = useCallback((text: string) => {
    const st = progressiveStateRef.current
    const prevNodeCount = st.nodeCount

    // --- Nodes ---
    const parsedNodes = extractJsonObjects(text, '"nodes"')
    for (let i = st.nodeCount; i < parsedNodes.length; i++) {
      const n = parsedNodes[i]
      if (!n.serviceId) continue
      const CONTROL_IDS = ['condition', 'fork', 'join', 'loop', 'delay', 'approval', 'subroute']
      const nodeType = n.nodeType || (CONTROL_IDS.includes(n.serviceId) ? n.serviceId : 'service')
      const svcType = n.serviceType === 'chatapp' ? 'chatapp' : 'api'
      addNode(n.serviceId, svcType as 'api' | 'chatapp', undefined, undefined, nodeType)
      const addedNodes = useWorkflowAgentStore.getState().editingAgent.nodes
      const lastNode = addedNodes[addedNodes.length - 1]
      if (lastNode && n.prompt) updateNodePrompt(lastNode.id, n.prompt)
      if (lastNode && n.config && Object.keys(n.config).length > 0) updateNodeConfig(lastNode.id, n.config)
      st.nodeCount = i + 1
    }

    // Edges are NOT added during progressive build — they are drawn
    // with animation during the final reveal sequence in onResult.

    // Fit viewport when new nodes are added so they stay visible during progressive build
    if (st.nodeCount > prevNodeCount) {
      requestAnimationFrame(() => fitToViewFromStore())
    }
  }, [addNode, updateNodePrompt, updateNodeConfig, fitToViewFromStore])

  const handleAiBuild = async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || aiBuildStreaming) return
    resetAiBuildStream()
    setAiBuildStreaming(true)
    // Reset progressive state
    progressiveStateRef.current = { nodeCount: 0, edgeCount: 0, fullText: '' }
    // Clear current canvas for fresh build
    const currentNodes = editingAgent.nodes
    currentNodes.forEach((n) => removeNode(n.id))

    // Throttled token display
    let tokenBuffer = ''
    let displayTimer: ReturnType<typeof setTimeout> | null = null
    const DISPLAY_INTERVAL = 250 // ms between display updates — slower for visual effect

    const flushTokens = () => {
      if (tokenBuffer) {
        appendAiBuildContent(tokenBuffer)
        progressiveStateRef.current.fullText += tokenBuffer
        tokenBuffer = ''
        // Auto-scroll streaming area
        requestAnimationFrame(() => {
          if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
        })
        // Try progressive build with accumulated text
        tryProgressiveBuild(progressiveStateRef.current.fullText)
      }
      displayTimer = null
    }

    try {
      const model = editingAgent.model || defaultModel || ''
      await aiAgentBuildStream(
        prompt,
        model,
        (token) => {
          tokenBuffer += token
          if (!displayTimer) {
            displayTimer = setTimeout(flushTokens, DISPLAY_INTERVAL)
          }
        },
        async (result) => {
          // Flush remaining tokens
          if (displayTimer) { clearTimeout(displayTimer); displayTimer = null }
          if (tokenBuffer) {
            appendAiBuildContent(tokenBuffer)
            tokenBuffer = ''
          }

          // ── Keep progressive nodes and animate them to final positions ──
          const progNodes = useWorkflowAgentStore.getState().editingAgent.nodes
          if (progNodes.length === 0) { setAiPrompt(''); return }

          // Build AI-id → progressive-node-id mapping (by index)
          const aiIdToProgId: Record<string, string> = {}
          result.nodes.forEach((rn: any, i: number) => {
            const aiId = rn.id || `node-${i}`
            if (progNodes[i]) {
              aiIdToProgId[aiId] = progNodes[i].id
              aiIdToProgId[String(i)] = progNodes[i].id
            }
          })

          // Compute final layout positions using existing progressive nodes
          let mappedEdges: AgentEdge[] = []
          let finalPositions: Record<string, { x: number; y: number }> = {}

          if (result.edges && result.edges.length > 0) {
            // Create edges with progressive node IDs for layout calculation
            mappedEdges = result.edges.map((e: any, i: number) => ({
              id: `edge-anim-${Date.now()}-${i}`,
              source: aiIdToProgId[e.source] || e.source,
              target: aiIdToProgId[e.target] || e.target,
              sourcePort: 'bottom' as PortSide,
              targetPort: 'top' as PortSide,
              edgeType: e.edgeType || '',
            }))
            const layouted = autoLayoutGraph(progNodes, mappedEdges)
            layouted.forEach((n) => { finalPositions[n.id] = { x: n.x, y: n.y } })
          } else {
            const layouted = autoLayoutNodes(progNodes)
            layouted.forEach((n) => { finalPositions[n.id] = { x: n.x, y: n.y } })
            mappedEdges = autoCreateLinearEdges(progNodes)
          }

          // Update node prompts/configs from final result (may differ from progressive parse)
          result.nodes.forEach((rn: any, i: number) => {
            if (progNodes[i]) {
              if (rn.prompt) updateNodePrompt(progNodes[i].id, rn.prompt)
              if (rn.config && Object.keys(rn.config).length > 0) updateNodeConfig(progNodes[i].id, rn.config)
            }
          })

          // Update schedule & name
          const schedule = result.schedule || {}
          useWorkflowAgentStore.setState((s) => ({
            editingAgent: {
              ...s.editingAgent,
              name: result.name || s.editingAgent.name,
              edges: mappedEdges,
              schedule: {
                ...s.editingAgent.schedule,
                execution_type: (schedule.execution_type === 'onetime' ? 'onetime' : 'recurring') as 'recurring' | 'onetime',
                schedule_type: (schedule.schedule_type === 'interval' ? 'interval' : 'cron') as 'cron' | 'interval',
                cron_hour: schedule.cron_hour ?? s.editingAgent.schedule.cron_hour,
                cron_minute: schedule.cron_minute ?? s.editingAgent.schedule.cron_minute,
                cron_days: schedule.cron_days ?? s.editingAgent.schedule.cron_days,
                interval_minutes: schedule.interval_minutes ?? s.editingAgent.schedule.interval_minutes,
                execute_immediately: schedule.execute_immediately ?? false,
              },
            },
            isDirty: true,
          }))

          // 1. First: set CSS transition on nodes (render with transition property)
          const movePhase: Record<string, 'move'> = {}
          progNodes.forEach((n) => { movePhase[n.id] = 'move' })
          setNodeAnimPhase(movePhase)

          // Fit viewport to final layout before move starts
          fitToViewFromStore()

          // Wait for React to render the transition property
          await new Promise((r) => setTimeout(r, 50))

          // 2. Now update positions — CSS transition animates from current to final
          progNodes.forEach((n) => {
            updateNodePosition(n.id, finalPositions[n.id]?.x ?? n.x, finalPositions[n.id]?.y ?? n.y)
          })

          // Wait for move transition to complete (500ms)
          await new Promise((r) => setTimeout(r, 550))

          // 2. Draw edges one by one with animation
          const donePhase: Record<string, 'done'> = {}
          progNodes.forEach((n) => { donePhase[n.id] = 'done' })
          setNodeAnimPhase(donePhase)

          for (const edge of mappedEdges) {
            setEdgeAnimating((prev) => new Set(prev).add(edge.id))
            await new Promise((r) => setTimeout(r, 300))
          }

          // 3. Clear animation states
          await new Promise((r) => setTimeout(r, 600))
          setNodeAnimPhase({})
          setEdgeAnimating(new Set())
          setAiPrompt('')
        },
        (error) => setAiBuildError(error),
      )
    } catch (err: any) {
      setAiBuildError(err.message || t('agent.aiBuildError'))
    } finally {
      if (displayTimer) { clearTimeout(displayTimer); flushTokens() }
      setAiBuildStreaming(false)
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
                onEdgeTypeChange={updateEdgeType}
                animating={edgeAnimating.has(edge.id)}
                hidden={Object.keys(nodeAnimPhase).length > 0 && !edgeAnimating.has(edge.id)}
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
              executionState={executionStates[node.id]}
              animPhase={nodeAnimPhase[node.id]}
              onDragStart={handleNodeDragStart}
              onPortDown={handlePortDown}
              onPortUp={handlePortUp}
              onRemove={removeNode}
              onPromptChange={updateNodePrompt}
              onConfigChange={updateNodeConfig}
              onOutputVarChange={updateNodeOutputVariable}
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
          {nodes.length > 0 && (
            <>
              <div className="w-px h-4 bg-slate-700 mx-0.5" />
              <button
                onClick={() => setShowJson((v) => !v)}
                className={`p-1 rounded transition-colors ${showJson ? 'bg-angel-600/30 text-angel-400' : 'hover:bg-slate-700/50 text-slate-400 hover:text-white'}`}
                title="JSON"
              >
                <Code2 size={13} />
              </button>
            </>
          )}
        </div>

        {/* JSON viewer panel */}
        {showJson && nodes.length > 0 && (
          <JsonViewerPanel
            editingAgent={editingAgent}
            jsonCopied={jsonCopied}
            onCopy={() => {
              const json = buildAgentJson(editingAgent)
              navigator.clipboard.writeText(json)
              setJsonCopied(true)
              setTimeout(() => setJsonCopied(false), 2000)
            }}
            onClose={() => setShowJson(false)}
          />
        )}
      </div>

      {/* AI Streaming Output */}
      {aiBuildStreaming && aiBuildStreamContent && (
        <div ref={streamRef} className="border-t border-slate-700 bg-slate-950/80 px-3 py-2 max-h-32 overflow-y-auto scroll-smooth">
          <pre className="text-[11px] text-emerald-400/80 whitespace-pre-wrap font-mono leading-relaxed">{aiBuildStreamContent}<span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse ml-0.5 align-middle" /></pre>
        </div>
      )}

      {/* AI Chat Input Bar */}
      <div className="border-t border-slate-700 bg-slate-900/80 backdrop-blur-sm px-3 py-2.5">
        {aiBuildError && <div className="text-[11px] text-red-400 mb-1.5 px-1">{aiBuildError}</div>}
        <div className="flex items-center gap-2">
          <Sparkles size={16} className={`shrink-0 ${aiBuildStreaming ? 'text-angel-400 animate-pulse' : 'text-angel-500/60'}`} />
          <input
            type="text"
            value={aiBuildStreaming ? t('agent.aiBuilding') : aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleAiBuild() } }}
            disabled={aiBuildStreaming}
            placeholder={t('agent.aiPlaceholder')}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button onClick={handleAiBuild} disabled={aiBuildStreaming || !aiPrompt.trim()} className="shrink-0 p-1.5 rounded-lg bg-angel-600 hover:bg-angel-700 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors" title="Enter">
            {aiBuildStreaming ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
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
  nodeWidth,
  onPortDown,
  onPortUp,
  label,
}: {
  side: PortSide
  connecting: boolean
  nodeId: string
  nodeWidth: number
  onPortDown: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onPortUp: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  label?: string
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
    <div className="relative">
      <div
        className={`${portBaseClass} ${connecting ? portActiveClass : portNormalClass}`}
        style={{ ...posStyle, width: NODE_PORT_SIZE, height: NODE_PORT_SIZE, zIndex: 5 }}
        onMouseDown={(e) => onPortDown(e, nodeId, side)}
        onMouseUp={(e) => onPortUp(e, nodeId, side)}
      />
      {label && (
        <span
          className="absolute text-[8px] font-bold select-none pointer-events-none"
          style={{
            ...(side === 'left' ? { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8 } : {}),
            ...(side === 'right' ? { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 } : {}),
            ...(side === 'top' ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 } : {}),
            ...(side === 'bottom' ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 } : {}),
            color: label === 'Yes' ? '#10b981' : label === 'No' ? '#ef4444' : '#94a3b8',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

// ── CanvasNode sub-component ──

interface CanvasNodeProps {
  node: AgentNodeDef
  selected: boolean
  connecting: boolean
  executionState?: 'pending' | 'running' | 'completed' | 'error'
  animPhase?: 'fade-in' | 'move' | 'done'
  onDragStart: (e: React.MouseEvent, nodeId: string) => void
  onPortDown: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onPortUp: (e: React.MouseEvent, nodeId: string, port: PortSide) => void
  onRemove: (nodeId: string) => void
  onPromptChange: (nodeId: string, prompt: string) => void
  onConfigChange: (nodeId: string, config: Record<string, any>) => void
  onOutputVarChange: (nodeId: string, name: string) => void
  onHeightChange: (nodeId: string, height: number) => void
  helpOpenFor: string | null
  setHelpOpenFor: (id: string | null) => void
  helpRef: React.RefObject<HTMLDivElement>
  t: (key: string) => string
}

function CanvasNode({
  node, selected, connecting, executionState, animPhase,
  onDragStart, onPortDown, onPortUp,
  onRemove, onPromptChange, onConfigChange, onOutputVarChange, onHeightChange,
  helpOpenFor, setHelpOpenFor, helpRef, t,
}: CanvasNodeProps) {
  const svc = getServiceDef(node.serviceId)
  const cardRef = useRef<HTMLDivElement>(null)
  const isChatApp = CHATAPP_IDS.has(node.serviceId) || node.serviceType === 'chatapp'
  const nt = node.nodeType || 'service'
  const isControl = nt !== 'service'
  const isCompact = COMPACT_NODES.has(nt)
  const nodeWidth = isCompact ? COMPACT_WIDTH : NODE_WIDTH
  const controlStyle = CONTROL_STYLES[nt]

  // Track height
  useEffect(() => {
    if (cardRef.current) {
      onHeightChange(node.id, cardRef.current.offsetHeight)
    }
  })

  if (!svc) return null
  const Icon = svc.icon

  // Execution state indicator
  const execIcon = executionState === 'running' ? '🔄'
    : executionState === 'completed' ? '✅'
    : executionState === 'error' ? '❌'
    : executionState === 'pending' ? '⏳' : null

  // Determine card styling
  const cardBg = controlStyle
    ? `${controlStyle.bg} ${controlStyle.border} ${controlStyle.hoverBorder}`
    : isChatApp
      ? 'bg-green-900/30 border-green-500/30 hover:border-green-400/50'
      : 'bg-slate-800/95 border-slate-700 hover:border-slate-600'

  // Port labels for condition nodes
  const leftLabel = nt === 'condition' ? 'Yes' : undefined
  const rightLabel = nt === 'condition' ? 'No' : undefined

  // Animation styles — smooth move transition when animPhase is 'move'
  const animStyle: React.CSSProperties = {
    left: node.x, top: node.y, width: nodeWidth, zIndex: selected ? 10 : 1,
    ...(animPhase === 'move' ? { transition: 'left 500ms ease-in-out, top 500ms ease-in-out' } : {}),
  }

  return (
    <div
      className="absolute select-none"
      style={animStyle}
    >
      {/* Node card body */}
      <div
        ref={cardRef}
        className={`relative border rounded-lg ${isCompact ? 'p-2' : 'p-3'} transition-all ${
          selected ? 'ring-2 ring-angel-500/50 ' : ''
        }${cardBg}`}
        style={{ cursor: 'grab' }}
        onMouseDown={(e) => {
          const tag = (e.target as HTMLElement).tagName
          if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT') return
          onDragStart(e, node.id)
        }}
      >
        {/* 4 Ports */}
        <PortDot side="top" connecting={connecting} nodeId={node.id} nodeWidth={nodeWidth} onPortDown={onPortDown} onPortUp={onPortUp} />
        <PortDot side="bottom" connecting={connecting} nodeId={node.id} nodeWidth={nodeWidth} onPortDown={onPortDown} onPortUp={onPortUp} />
        <PortDot side="left" connecting={connecting} nodeId={node.id} nodeWidth={nodeWidth} onPortDown={onPortDown} onPortUp={onPortUp} label={leftLabel} />
        <PortDot side="right" connecting={connecting} nodeId={node.id} nodeWidth={nodeWidth} onPortDown={onPortDown} onPortUp={onPortUp} label={rightLabel} />

        {/* Execution state */}
        {execIcon && (
          <span className="absolute -top-2 -left-2 text-sm z-10">{execIcon}</span>
        )}

        {/* Node header */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border shrink-0 ${svc.bgColor}`}>
              <Icon size={isCompact ? 10 : 12} className={svc.color} />
              <span className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-medium text-slate-200`}>{svc.name}</span>
            </div>
            {isChatApp && (
              <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                <Send size={9} />
                {t('agent.sendResult')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {/* Help icon (only for service nodes) */}
            {!isControl && (
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
            )}
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id) }} className="p-1 rounded hover:bg-slate-700 transition-colors">
              <X size={12} className="text-slate-500 hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* Node body: varies by nodeType */}
        {isCompact ? (
          /* Compact nodes (fork, join, delay) - minimal body */
          nt === 'delay' ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={3600}
                value={node.config.delaySeconds || 5}
                onChange={(e) => onConfigChange(node.id, { delaySeconds: parseInt(e.target.value) || 5 })}
                className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500"
              />
              <span className="text-[10px] text-slate-500">sec</span>
            </div>
          ) : null
        ) : nt === 'condition' ? (
          /* Condition node */
          <textarea
            value={node.config.condition || node.prompt || ''}
            onChange={(e) => {
              onConfigChange(node.id, { condition: e.target.value })
              onPromptChange(node.id, e.target.value)
            }}
            placeholder="Enter condition (e.g., stock price dropped > 5%)"
            rows={2}
            className="w-full bg-amber-950/30 border border-amber-500/20 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-600 resize-none"
          />
        ) : nt === 'loop' ? (
          /* Loop node */
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <select
                value={node.config.loopType || 'count'}
                onChange={(e) => onConfigChange(node.id, { loopType: e.target.value })}
                className="bg-purple-950/30 border border-purple-500/20 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none"
              >
                <option value="count">Count</option>
                <option value="while">While</option>
                <option value="forEach">For Each</option>
              </select>
              {(node.config.loopType || 'count') === 'count' && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={node.config.maxIterations || 5}
                  onChange={(e) => onConfigChange(node.id, { maxIterations: parseInt(e.target.value) || 5 })}
                  className="w-12 bg-purple-950/30 border border-purple-500/20 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none"
                />
              )}
            </div>
            {(node.config.loopType === 'while') && (
              <textarea
                value={node.config.condition || ''}
                onChange={(e) => onConfigChange(node.id, { condition: e.target.value })}
                placeholder="While condition..."
                rows={1}
                className="w-full bg-purple-950/30 border border-purple-500/20 rounded px-2 py-1 text-[10px] text-slate-200 focus:outline-none resize-none placeholder-slate-600"
              />
            )}
          </div>
        ) : nt === 'approval' ? (
          /* Approval node */
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500">Timeout:</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={node.config.timeoutMinutes || 60}
              onChange={(e) => onConfigChange(node.id, { timeoutMinutes: parseInt(e.target.value) || 60 })}
              className="w-14 bg-amber-950/30 border border-amber-500/20 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500">min</span>
          </div>
        ) : nt === 'subroute' ? (
          /* Sub-agent node */
          <input
            type="text"
            value={node.config.agentId || ''}
            onChange={(e) => onConfigChange(node.id, { agentId: e.target.value })}
            placeholder="Agent ID"
            className="w-full bg-indigo-950/30 border border-indigo-500/20 rounded px-2 py-1 text-[10px] text-slate-200 focus:outline-none placeholder-slate-600"
          />
        ) : isChatApp ? (
          <div className="text-[11px] text-green-400/70 bg-green-900/10 rounded px-2 py-1.5 border border-green-500/10">
            {t('agent.chatAppHint')}
          </div>
        ) : (
          /* Standard service node */
          <>
            <textarea
              value={node.prompt}
              onChange={(e) => onPromptChange(node.id, e.target.value)}
              placeholder={t('agent.nodePrompt')}
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 resize-none"
            />
            {/* Retry config */}
            {(node.config.retryCount ?? 0) > 0 && (
              <div className="mt-1 text-[9px] text-slate-500">
                Retry: {node.config.retryCount}x / {node.config.retryDelay || 3}s
              </div>
            )}
          </>
        )}

        {/* Output variable tag (all node types) */}
        {node.outputVariable && (
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[9px] text-slate-500">→</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-angel-500/10 border border-angel-500/20 text-angel-400 font-mono">
              {node.outputVariable}
            </span>
          </div>
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
  onEdgeTypeChange: (edgeId: string, edgeType: string) => void
  animating?: boolean
  hidden?: boolean
}

function BezierEdge({ edge, nodes, getNodeHeight, selected, onClick, onEdgeTypeChange, animating, hidden }: BezierEdgeProps) {
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

  // Edge type styling
  const et = edge.edgeType || ''
  const etColors = EDGE_TYPE_COLORS[et]
  const strokeColor = selected ? '#f59e0b' : etColors ? etColors.stroke : '#64748b'
  const isDashed = et === 'error' || et === 'loop'

  // Midpoint for label
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  // Edge draw animation using stroke-dashoffset
  const pathRef = useRef<SVGPathElement>(null)
  const [drawProgress, setDrawProgress] = useState<{ len: number; done: boolean } | null>(null)
  useEffect(() => {
    if (animating && pathRef.current) {
      const len = pathRef.current.getTotalLength()
      setDrawProgress({ len, done: false })
      // Trigger transition on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDrawProgress({ len, done: true }))
      })
    } else if (!animating) {
      setDrawProgress(null)
    }
  }, [animating])

  // Hide edges that haven't been animated yet during animation sequence
  if (hidden) return null

  return (
    <g className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(edge.id) }}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 2.5 : 2}
        strokeDasharray={drawProgress ? drawProgress.len : selected ? '6 3' : isDashed ? '5 3' : 'none'}
        strokeDashoffset={drawProgress ? (drawProgress.done ? 0 : drawProgress.len) : 0}
        className="transition-colors"
        style={drawProgress ? { transition: 'stroke-dashoffset 500ms ease-out' } : undefined}
      />
      {/* Arrow triangle at end */}
      <g
        transform={`translate(${end.x},${end.y}) rotate(${angle})`}
        style={drawProgress ? { opacity: drawProgress.done ? 1 : 0, transition: 'opacity 200ms ease-out 400ms' } : undefined}
      >
        <polygon points="0,2 -4,-5 4,-5" fill={strokeColor} />
      </g>
      {/* Edge type label badge */}
      {et && (
        <g
          transform={`translate(${midX},${midY})`}
          style={drawProgress ? { opacity: drawProgress.done ? 1 : 0, transition: 'opacity 200ms ease-out 350ms' } : undefined}
        >
          <rect x={-16} y={-8} width={32} height={16} rx={4} fill={etColors?.stroke || '#64748b'} opacity={0.9} />
          <text x={0} y={4} textAnchor="middle" fontSize={9} fontWeight="bold" fill="white">
            {et === 'yes' ? 'Yes' : et === 'no' ? 'No' : et === 'error' ? 'Err' : et === 'loop' ? 'Loop' : et}
          </text>
        </g>
      )}
      {/* Edge type selector when selected */}
      {selected && (
        <foreignObject x={midX - 50} y={midY + 12} width={100} height={24}>
          <select
            value={et}
            onChange={(e) => { e.stopPropagation(); onEdgeTypeChange(edge.id, e.target.value) }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-200 px-1 py-0.5"
          >
            <option value="">Default</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="error">Error</option>
            <option value="loop">Loop</option>
          </select>
        </foreignObject>
      )}
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

// ── JSON Viewer Panel ──

function JsonViewerPanel({
  editingAgent,
  jsonCopied,
  onCopy,
  onClose,
}: {
  editingAgent: { name: string; nodes: AgentNodeDef[]; edges: AgentEdge[]; schedule: any; model: string }
  jsonCopied: boolean
  onCopy: () => void
  onClose: () => void
}) {
  const json = buildAgentJson(editingAgent)
  const lineCount = json.split('\n').length
  const nodeCount = editingAgent.nodes.length
  const edgeCount = editingAgent.edges.length
  const controlCount = editingAgent.nodes.filter((n) => n.nodeType && n.nodeType !== 'service').length

  return (
    <div className="absolute top-10 right-2 z-30 w-80 max-h-[70%] bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Code2 size={13} className="text-angel-400" />
          <span className="text-xs font-medium text-slate-200">JSON</span>
          <span className="text-[10px] text-slate-500">
            {nodeCount} nodes · {edgeCount} edges{controlCount > 0 ? ` · ${controlCount} control` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {jsonCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            {jsonCopied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* JSON content */}
      <div className="flex-1 overflow-auto p-3">
        <pre className="text-[11px] leading-[1.5] font-mono text-slate-300 whitespace-pre">
          <JsonHighlighted json={json} />
        </pre>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-slate-700/50 text-[9px] text-slate-600">
        {lineCount} lines · {new Blob([json]).size.toLocaleString()} bytes
      </div>
    </div>
  )
}

// ── JSON Syntax Highlighter ──

function JsonHighlighted({ json }: { json: string }) {
  // Simple JSON syntax highlighting
  const highlighted = json.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g, // keys
    '<span class="text-angel-400">$1</span>:',
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g, // string values
    ': <span class="text-emerald-400">$1</span>',
  ).replace(
    /:\s*(\d+)/g, // number values
    ': <span class="text-amber-400">$1</span>',
  ).replace(
    /:\s*(true|false|null)/g, // boolean/null values
    ': <span class="text-purple-400">$1</span>',
  )

  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />
}
