import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import OntologyGraph, { type GraphNode, type GraphEdge, type GraphHandle, type LayoutMode, type Vulnerability } from './OntologyGraph'
import OntologyFileList from './OntologyFileList'
import OntologyProperties from './OntologyProperties'
import { analyzeOntology, listOntologyFiles, getCodePreview } from '../../api/client'
import { ZoomIn, ZoomOut, Search, Download, GitBranch, AlertTriangle, Ghost, RefreshCw, Locate, ShieldAlert } from 'lucide-react'

interface FileEntry {
  path: string
  ext: string
}

export default function OntologyPanel() {
  const graphRef = useRef<GraphHandle>(null)
  const [folderPath, setFolderPath] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [highlightFile, setHighlightFile] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [manualPath, setManualPath] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  // New feature state
  const [layout, setLayout] = useState<LayoutMode>('force')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [inheritanceMode, setInheritanceMode] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{ node: GraphNode; x: number; y: number; code?: string } | null>(null)
  const hoverTimerRef = useRef<number>(0)
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])

  // Computed stats
  const cycleCount = useMemo(() => edges.filter(e => e.circular).length, [edges])
  const deadCount = useMemo(() => nodes.filter(n => n.dead).length, [nodes])
  const vulnCount = useMemo(() => vulnerabilities.length, [vulnerabilities])

  // Circular edge source nodes (unique) for badge click navigation
  const circularNodes = useMemo(() => {
    const ids = new Set<string>()
    for (const e of edges) {
      if (e.circular) { ids.add(e.source); ids.add(e.target) }
    }
    return nodes.filter(n => ids.has(n.id))
  }, [edges, nodes])

  const deadNodes = useMemo(() => nodes.filter(n => n.dead), [nodes])
  const vulnNodes = useMemo(() => {
    const ids = new Set(vulnerabilities.map(v => v.nodeId))
    return nodes.filter(n => ids.has(n.id))
  }, [vulnerabilities, nodes])

  const cycleIdxRef = useRef(0)
  const deadIdxRef = useRef(0)
  const vulnIdxRef = useRef(0)

  const handleCycleBadgeClick = useCallback(() => {
    if (circularNodes.length === 0) return
    cycleIdxRef.current = cycleIdxRef.current % circularNodes.length
    const node = circularNodes[cycleIdxRef.current]
    setSelectedNode(node)
    graphRef.current?.focusOnNode(node.id)
    cycleIdxRef.current = (cycleIdxRef.current + 1) % circularNodes.length
  }, [circularNodes])

  const handleDeadBadgeClick = useCallback(() => {
    if (deadNodes.length === 0) return
    deadIdxRef.current = deadIdxRef.current % deadNodes.length
    const node = deadNodes[deadIdxRef.current]
    setSelectedNode(node)
    graphRef.current?.focusOnNode(node.id)
    deadIdxRef.current = (deadIdxRef.current + 1) % deadNodes.length
  }, [deadNodes])

  const handleVulnBadgeClick = useCallback(() => {
    if (vulnNodes.length === 0) return
    vulnIdxRef.current = vulnIdxRef.current % vulnNodes.length
    const node = vulnNodes[vulnIdxRef.current]
    setSelectedNode(node)
    graphRef.current?.focusOnNode(node.id)
    vulnIdxRef.current = (vulnIdxRef.current + 1) % vulnNodes.length
  }, [vulnNodes])

  // Impact analysis: BFS from selected node
  const impactMap = useMemo(() => {
    if (!selectedNode) return null
    const map = new Map<string, number>()
    const queue: [string, number][] = [[selectedNode.id, 0]]
    map.set(selectedNode.id, 0)

    // Build outgoing adjacency from edges
    const outAdj = new Map<string, string[]>()
    for (const e of edges) {
      if (!outAdj.has(e.source)) outAdj.set(e.source, [])
      outAdj.get(e.source)!.push(e.target)
    }

    let qi = 0
    while (qi < queue.length) {
      const [curr, depth] = queue[qi++]
      if (depth >= 3) continue
      for (const nb of outAdj.get(curr) ?? []) {
        if (!map.has(nb)) {
          map.set(nb, depth + 1)
          queue.push([nb, depth + 1])
        }
      }
    }
    return map.size > 1 ? map : null
  }, [selectedNode, edges])

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return nodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, 20)
  }, [nodes, searchQuery])

  // Inheritance mode filtering
  const displayEdges = useMemo(() => {
    if (!inheritanceMode) return edges
    return edges.filter(e => e.type === 'extends' || e.type === 'implements')
  }, [edges, inheritanceMode])

  const displayNodes = useMemo(() => {
    if (!inheritanceMode) return nodes
    const involved = new Set<string>()
    for (const e of displayEdges) {
      involved.add(e.source)
      involved.add(e.target)
    }
    return nodes.filter(n => involved.has(n.id))
  }, [nodes, displayEdges, inheritanceMode])

  // Ctrl+F shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const loadFolder = useCallback(async (folder: string) => {
    setFolderPath(folder)
    setError(null)
    setLoading(true)
    setSelectedNode(null)
    setHighlightFile(null)
    setShowManualInput(false)
    setInheritanceMode(false)

    try {
      const [fileResult, graphResult] = await Promise.all([
        listOntologyFiles(folder),
        analyzeOntology(folder),
      ])

      setFiles(fileResult.files)

      const graphNodes: GraphNode[] = graphResult.nodes.map((n, i) => {
        const angle = i * 2.39996
        const r = Math.sqrt(i) * 30
        return {
          ...n,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          vx: 0,
          vy: 0,
        }
      })
      setNodes(graphNodes)
      setEdges(graphResult.edges)
      setVulnerabilities(graphResult.vulnerabilities || [])
      cycleIdxRef.current = 0
      deadIdxRef.current = 0
      vulnIdxRef.current = 0
    } catch (err: any) {
      setError(err.message || 'Failed to analyze folder')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelectFolder = useCallback(async () => {
    try {
      const folder = await window.electronAPI.selectFolder()
      if (!folder) return
      await loadFolder(folder)
    } catch (err: any) {
      setShowManualInput(true)
    }
  }, [loadFolder])

  const handleManualSubmit = useCallback(async () => {
    const folder = manualPath.trim()
    if (!folder) return
    await loadFolder(folder)
  }, [manualPath, loadFolder])

  const handleSelectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleNavigateToNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
      graphRef.current?.focusOnNode(nodeId)
    }
  }, [nodes])

  const handleHighlightFile = useCallback((file: string | null) => {
    setHighlightFile(file)
    if (file) {
      graphRef.current?.focusOnFile(file)
    }
  }, [])

  // Code preview on hover
  const handleHoverNode = useCallback((node: GraphNode | null, screenX: number, screenY: number) => {
    clearTimeout(hoverTimerRef.current)
    if (!node || !node.line || node.file === '(external)') {
      setHoverInfo(null)
      return
    }
    setHoverInfo({ node, x: screenX, y: screenY })
    hoverTimerRef.current = window.setTimeout(async () => {
      try {
        const fullPath = folderPath + '/' + node.file
        const result = await getCodePreview(fullPath, node.line!, 5)
        setHoverInfo(prev => prev?.node.id === node.id ? { ...prev, code: result.code } : prev)
      } catch { /* ignore */ }
    }, 400)
  }, [folderPath])

  // PNG export
  const handleExport = useCallback(() => {
    const canvas = graphRef.current?.getCanvas()
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'ontology-graph.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [])

  return (
    <div className="flex h-full">
      {/* Left: File List */}
      <div className="w-60 border-r border-slate-700 bg-slate-900 shrink-0 flex flex-col">
        <OntologyFileList
          folderPath={folderPath}
          files={files}
          loading={loading}
          highlightFile={highlightFile}
          onSelectFolder={handleSelectFolder}
          onHighlightFile={handleHighlightFile}
        />
        {showManualInput && (
          <div className="p-2 border-t border-slate-700">
            <input
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="C:\path\to\folder"
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 mb-1"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              className="w-full px-2 py-1 bg-angel-600 hover:bg-angel-500 text-white text-xs rounded"
            >
              Analyze
            </button>
          </div>
        )}
      </div>

      {/* Center: Graph Canvas */}
      <div className="flex-1 relative">
        {error && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded">
            {error}
          </div>
        )}

        {/* Search overlay */}
        {searchOpen && nodes.length > 0 && (
          <div className="absolute top-2 left-2 z-20 w-64">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes..."
                className="w-full bg-slate-800/95 border border-slate-600 rounded px-2 py-1.5 pl-7 text-xs text-slate-200 focus:outline-none focus:border-angel-500"
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 bg-slate-800/95 border border-slate-600 rounded max-h-48 overflow-y-auto">
                {searchResults.map(n => (
                  <button
                    key={n.id}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 flex justify-between"
                    onClick={() => {
                      setSelectedNode(n)
                      graphRef.current?.focusOnNode(n.id)
                      setSearchOpen(false)
                      setSearchQuery('')
                    }}
                  >
                    <span className="truncate">{n.label}</span>
                    <span className="text-slate-500 ml-2 shrink-0">{n.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Code preview tooltip */}
        {hoverInfo?.code && (
          <div
            className="absolute z-30 bg-slate-800 border border-slate-600 rounded shadow-lg p-2 max-w-md pointer-events-none"
            style={{ left: Math.min(hoverInfo.x + 12, window.innerWidth - 420), top: Math.max(10, hoverInfo.y - 80) }}
          >
            <div className="text-[10px] text-slate-500 mb-1">{hoverInfo.node.file}:{hoverInfo.node.line}</div>
            <pre className="text-[10px] text-slate-300 font-mono whitespace-pre overflow-hidden max-h-48 leading-relaxed">
              {hoverInfo.code}
            </pre>
          </div>
        )}

        {nodes.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full bg-[#111111]">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-3 opacity-30">&#x1F578;</div>
              <p className="text-sm">Select a folder to visualize code relationships</p>
              <p className="text-xs mt-1 text-slate-600">
                Supports Java, Python, TypeScript, JavaScript, Go, C/C++
              </p>
            </div>
          </div>
        ) : (
          <OntologyGraph
            ref={graphRef}
            nodes={displayNodes}
            edges={displayEdges}
            selectedNodeId={selectedNode?.id ?? null}
            highlightFile={highlightFile}
            layout={inheritanceMode ? 'tree' : layout}
            impactMap={impactMap}
            onSelectNode={handleSelectNode}
            onHoverNode={handleHoverNode}
          />
        )}

        {/* Toolbar overlay */}
        {nodes.length > 0 && (
          <>
            {/* Top-left: refresh */}
            <div className="absolute top-2 left-2 z-10">
              <button
                onClick={() => folderPath && loadFolder(folderPath)}
                disabled={loading}
                className="flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] px-2 py-1 rounded transition-colors disabled:opacity-50"
                title="Refresh analysis"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Top-right: badges */}
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              {cycleCount > 0 && (
                <button
                  onClick={handleCycleBadgeClick}
                  className="flex items-center gap-1 bg-red-900/80 hover:bg-red-800/90 text-red-300 text-[10px] px-2 py-1 rounded cursor-pointer transition-colors"
                  title="Click to navigate circular dependencies"
                >
                  <AlertTriangle size={11} />
                  <span>{cycleCount} cycle{cycleCount > 1 ? 's' : ''}</span>
                </button>
              )}
              <button
                onClick={handleDeadBadgeClick}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
                  deadCount > 0
                    ? 'bg-slate-700/80 hover:bg-slate-600/90 text-slate-400 cursor-pointer'
                    : 'bg-slate-800/60 text-slate-600 cursor-default'
                }`}
                title={deadCount > 0 ? 'Click to navigate dead code' : 'No dead code detected'}
              >
                <Ghost size={11} />
                <span>{deadCount} dead</span>
              </button>
              <button
                onClick={handleVulnBadgeClick}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
                  vulnCount > 0
                    ? 'bg-red-900/80 hover:bg-red-800/90 text-red-300 cursor-pointer'
                    : 'bg-slate-800/60 text-slate-600 cursor-default'
                }`}
                title={vulnCount > 0 ? 'Click to navigate security issues' : 'No vulnerabilities detected'}
              >
                <ShieldAlert size={11} />
                <span>{vulnCount} vuln{vulnCount !== 1 ? 's' : ''}</span>
              </button>
            </div>

            {/* Bottom-right: controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
              {/* Layout selector */}
              <div className="flex flex-col gap-1 mb-1">
                {(['force', 'tree', 'radial'] as const).map(l => (
                  <button
                    key={l}
                    className={`w-7 h-7 text-[9px] rounded flex items-center justify-center ${
                      (inheritanceMode ? 'tree' : layout) === l
                        ? 'bg-angel-600 text-white'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                    onClick={() => { setLayout(l); setInheritanceMode(false) }}
                    title={`${l} layout`}
                  >
                    {l[0].toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <button
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  inheritanceMode
                    ? 'bg-angel-600 text-white'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
                title="Inheritance Tree"
                onClick={() => setInheritanceMode(!inheritanceMode)}
              >
                <GitBranch size={14} />
              </button>
              <button
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  searchOpen
                    ? 'bg-angel-600 text-white'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
                title="Search (Ctrl+F)"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search size={14} />
              </button>
              <button
                className="w-7 h-7 bg-slate-800/80 hover:bg-slate-700 rounded flex items-center justify-center text-slate-400 hover:text-white"
                title="Export PNG"
                onClick={handleExport}
              >
                <Download size={14} />
              </button>
              <button
                className="w-7 h-7 bg-slate-800/80 hover:bg-slate-700 rounded flex items-center justify-center text-slate-400 hover:text-white"
                title="Zoom In"
                onClick={() => graphRef.current?.zoomIn()}
              >
                <ZoomIn size={14} />
              </button>
              <button
                className="w-7 h-7 bg-slate-800/80 hover:bg-slate-700 rounded flex items-center justify-center text-slate-400 hover:text-white"
                title="Zoom Out"
                onClick={() => graphRef.current?.zoomOut()}
              >
                <ZoomOut size={14} />
              </button>
              <button
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  selectedNode
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer'
                    : 'bg-slate-800/40 text-slate-600 cursor-default'
                }`}
                title={selectedNode ? `Focus on ${selectedNode.label}` : 'Select a node first'}
                onClick={() => selectedNode && graphRef.current?.focusOnNode(selectedNode.id)}
              >
                <Locate size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: Properties Panel */}
      {selectedNode && (
        <div className="w-72 border-l border-slate-700 bg-slate-900 shrink-0">
          <OntologyProperties
            node={selectedNode}
            edges={edges}
            allNodes={nodes}
            impactMap={impactMap}
            vulnerabilities={vulnerabilities}
            onClose={() => setSelectedNode(null)}
            onNavigate={handleNavigateToNode}
          />
        </div>
      )}
    </div>
  )
}
