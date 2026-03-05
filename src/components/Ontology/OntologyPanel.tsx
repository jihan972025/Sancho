import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import OntologyGraph, { type GraphNode, type GraphEdge, type GraphHandle, type LayoutMode, type Vulnerability } from './OntologyGraph'
import OntologyFileList from './OntologyFileList'
import OntologyProperties from './OntologyProperties'
import { analyzeOntology, listOntologyFiles, getCodePreview } from '../../api/client'
import { ZoomIn, ZoomOut, Search, Download, GitBranch, AlertTriangle, Ghost, RefreshCw, Locate, ShieldAlert, BookOpen, X } from 'lucide-react'

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
  const [showDoc, setShowDoc] = useState(false)

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

        {/* Doc button — always visible */}
        <div className="absolute top-2 left-2 z-10 flex gap-1">
          {nodes.length > 0 && (
            <button
              onClick={() => folderPath && loadFolder(folderPath)}
              disabled={loading}
              className="flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] px-2 py-1 rounded transition-colors disabled:opacity-50"
              title="Refresh analysis"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
          <button
            onClick={() => setShowDoc(true)}
            className="flex items-center gap-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] px-2 py-1 rounded transition-colors"
            title="Documentation"
          >
            <BookOpen size={11} />
            <span>Doc</span>
          </button>
        </div>

        {/* Toolbar overlay */}
        {nodes.length > 0 && (
          <>

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

      {/* Documentation Modal */}
      {showDoc && <OntologyDocModal onClose={() => setShowDoc(false)} />}
    </div>
  )
}

/* ─── Documentation Modal ─── */
function OntologyDocModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-angel-400" />
            <h2 className="text-sm font-semibold text-white">Ontology Analysis Documentation</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs text-slate-300 leading-relaxed">
          {/* 개요 */}
          <DocSection title="개요" icon="🔬">
            <p>
              Ontology Analysis는 소스 코드의 클래스, 메소드, 함수 간 관계를 시각적으로 분석하는 도구입니다.
              폴더를 선택하면 코드를 파싱하여 호출 관계, 상속 구조, import 의존성을 그래프로 렌더링합니다.
              Java, Python, TypeScript, JavaScript, Go, C/C++ 을 지원합니다.
            </p>
          </DocSection>

          <div className="border-t border-slate-800" />

          {/* 코드 분석 기능 */}
          <div className="text-[11px] font-semibold text-angel-400 uppercase tracking-wide">코드 분석</div>

          {/* 1. 순환 참조 감지 */}
          <DocSection title="순환 참조 감지" icon="🔴">
            <p>
              순환 import/호출 관계를 자동 감지합니다. 순환 참조가 발견되면 해당 엣지가 <b className="text-red-400">빨간색</b>으로 하이라이트되고,
              관련 노드 사이의 연결선이 빨간색 점선으로 표시됩니다.
            </p>
            <p className="mt-1">
              우측 상단의 <b className="text-red-300">cycle</b> 배지를 클릭하면 순환 참조 노드를 순차적으로 탐색할 수 있습니다.
              노드를 클릭하면 우측 속성창에 Cycle Path(순환 경로)가 BFS 기반으로 표시됩니다.
            </p>
            <DocNote>
              순환 참조의 문제점: 무한 루프 위험, 테스트 어려움, 변경 영향 확산, 빌드 순서 문제, 코드 가독성 저하, 재사용성 감소
            </DocNote>
          </DocSection>

          {/* 2. 데드 코드 탐지 */}
          <DocSection title="데드 코드 탐지" icon="👻">
            <p>
              어디에서도 호출/참조되지 않는 메소드/함수를 탐지합니다. Fan-in(incoming 호출 수)이 0인 노드를
              데드 코드로 판정하여 <b className="text-slate-400">회색, 점선 테두리, 낮은 불투명도</b>로 표시합니다.
            </p>
            <p className="mt-1">
              우측 상단의 <b className="text-slate-400">dead</b> 배지를 클릭하면 데드 코드 노드를 순차 탐색합니다.
            </p>
            <DocNote>
              한계: entry point(main 함수), 이벤트 핸들러, 리플렉션 호출, 외부 API 엔드포인트 등은
              실제로는 사용되지만 정적 분석에서 데드 코드로 오탐될 수 있습니다.
            </DocNote>
          </DocSection>

          {/* 3. 영향도 분석 */}
          <DocSection title="영향도 분석" icon="⚡">
            <p>
              특정 노드를 클릭하면 해당 노드 변경 시 영향 받는 노드들을 <b>BFS 3단계</b>로 탐색하여 하이라이트합니다.
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <div className="bg-orange-900/30 rounded p-1.5 text-center">
                <div className="text-orange-400 font-bold text-[11px]">1차</div>
                <div className="text-[10px] text-orange-300/70">직접 호출</div>
              </div>
              <div className="bg-orange-900/20 rounded p-1.5 text-center">
                <div className="text-orange-500/70 font-bold text-[11px]">2차</div>
                <div className="text-[10px] text-orange-400/50">간접 영향</div>
              </div>
              <div className="bg-orange-900/10 rounded p-1.5 text-center">
                <div className="text-orange-600/50 font-bold text-[11px]">3차</div>
                <div className="text-[10px] text-orange-500/30">파급 영향</div>
              </div>
            </div>
            <p className="mt-1.5">
              우측 속성창의 Impact Analysis 섹션에서 각 단계별 영향 노드 목록을 확인하고 클릭하여 이동할 수 있습니다.
            </p>
          </DocSection>

          {/* 4. 복잡도 메트릭 */}
          <DocSection title="복잡도 메트릭" icon="📊">
            <p className="font-medium text-white mb-1">측정 항목</p>
            <div className="overflow-hidden rounded border border-slate-700">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-800/80">
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium">메트릭</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium">설명</th>
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium">계산 방식</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr><td className="px-2 py-1 text-angel-400">Fan-in</td><td className="px-2 py-1">이 노드를 호출하는 수</td><td className="px-2 py-1 text-slate-400">incoming calls/references 엣지 수</td></tr>
                  <tr><td className="px-2 py-1 text-angel-400">Fan-out</td><td className="px-2 py-1">이 노드가 호출하는 수</td><td className="px-2 py-1 text-slate-400">outgoing calls/references 엣지 수</td></tr>
                  <tr><td className="px-2 py-1 text-angel-400">Lines</td><td className="px-2 py-1">메소드 본문 라인 수</td><td className="px-2 py-1 text-slate-400">{'{ } 매칭으로 계산'}</td></tr>
                </tbody>
              </table>
            </div>

            <p className="font-medium text-white mt-3 mb-1">시각적 반영</p>
            <ul className="space-y-1 ml-1">
              <li><b className="text-slate-200">노드 크기</b> — 연결 수(connections)에 비례: 연결 많은 노드 → 큰 원, 연결 없는 노드 → 작은 원</li>
              <li><b className="text-slate-200">노드 색상</b> — Fan-in + Fan-out 합산으로 히트맵:</li>
            </ul>
            <div className="ml-3 mt-1 space-y-0.5 text-[10px]">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" /> 낮음 (0~2) → 클러스터 기본 색상</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" /> 중간 (3~5) → 주황 쪽으로 블렌딩</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 shrink-0" /> 높음 (6+) → 빨간/주황 강조</div>
            </div>

            <p className="font-medium text-white mt-3 mb-1">속성창 표시</p>
            <pre className="bg-slate-800/60 rounded p-2 text-[10px] font-mono text-slate-400 leading-snug overflow-x-auto">{`┌────────────┬─────────┬────────┐
│ Connections│ Cluster │ Fan-in │
│     12     │   #3    │   5    │
├────────────┼─────────┼────────┤
│  Fan-out   │  Lines  │        │
│     7      │   42    │        │
└────────────┴─────────┴────────┘`}</pre>

            <p className="font-medium text-white mt-3 mb-1">복잡도가 높은 노드의 문제점</p>
            <ul className="space-y-0.5 ml-1">
              <li><b className="text-orange-400">Fan-in 높음</b> → 많은 곳에서 의존 → 변경 시 영향 범위 큼</li>
              <li><b className="text-orange-400">Fan-out 높음</b> → 많은 것에 의존 → 하나 바뀌면 깨질 가능성 높음</li>
              <li><b className="text-orange-400">Lines 높음</b> → 메소드가 너무 김 → 분리(Extract Method) 검토</li>
              <li><b className="text-red-400">Fan-in + Fan-out 모두 높음</b> → &quot;God Method&quot; → 리팩토링 최우선 대상</li>
            </ul>

            <DocNote>
              활용법: 그래프에서 크고 붉은 노드를 찾으면 → 복잡도 높은 핵심 코드.
              클릭해서 Fan-in/Fan-out/Lines 수치 확인.
              Fan-out 10 이상이면 책임 분리, Lines 50 이상이면 메소드 분할 검토.
            </DocNote>
          </DocSection>

          {/* 5. 취약점 점검 */}
          <DocSection title="취약점 점검" icon="🛡️">
            <p>
              코드를 regex 패턴으로 스캔하여 보안 취약점을 자동 탐지합니다. 언어별로 적용 가능한 규칙만 실행됩니다.
            </p>
            <div className="overflow-hidden rounded border border-slate-700 mt-1.5">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-800/80">
                    <th className="px-2 py-1 text-left text-slate-400 font-medium">Severity</th>
                    <th className="px-2 py-1 text-left text-slate-400 font-medium">Rules</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr><td className="px-2 py-1 text-red-400 font-bold">Critical</td><td className="px-2 py-1">SQL Injection, Command Injection, Unsafe Deserialization</td></tr>
                  <tr><td className="px-2 py-1 text-orange-400 font-bold">High</td><td className="px-2 py-1">Hardcoded Credentials, eval/exec, XSS</td></tr>
                  <tr><td className="px-2 py-1 text-yellow-400 font-bold">Medium</td><td className="px-2 py-1">Weak Crypto (MD5/SHA1), XXE, Prototype Pollution</td></tr>
                  <tr><td className="px-2 py-1 text-blue-400 font-bold">Low</td><td className="px-2 py-1">Hardcoded IP Address</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5">
              취약점이 있는 노드에는 <b className="text-red-400">빨간 점 인디케이터</b>가 표시됩니다.
              우측 상단 <b className="text-red-300">vuln</b> 배지 클릭으로 취약 노드를 순차 탐색하고,
              노드 클릭 시 속성창의 Security Issues 섹션에서 상세 내용을 확인합니다.
            </p>
          </DocSection>

          <div className="border-t border-slate-800" />

          {/* 시각화 개선 */}
          <div className="text-[11px] font-semibold text-angel-400 uppercase tracking-wide">시각화 개선</div>

          {/* 6. 노드 검색 */}
          <DocSection title="노드 검색" icon="🔍">
            <p>
              <b className="text-slate-200">Ctrl+F</b> 또는 우측 하단 검색 버튼을 클릭하면 검색바가 열립니다.
              클래스명, 메소드명을 입력하면 매칭되는 노드 목록이 표시되고, 클릭 시 해당 노드로 이동합니다.
            </p>
          </DocSection>

          {/* 7. 레이아웃 전환 */}
          <DocSection title="레이아웃 전환" icon="📐">
            <p>우측 하단의 F/T/R 버튼으로 3가지 레이아웃을 전환합니다:</p>
            <ul className="mt-1 space-y-0.5 ml-1">
              <li><b className="text-slate-200">Force (F)</b> — 물리 시뮬레이션 기반. 연결된 노드끼리 가까이, 관련 없는 노드는 멀리 배치</li>
              <li><b className="text-slate-200">Tree (T)</b> — 좌→우 트리 구조. 호출 깊이에 따라 수평 배치, 하위 트리 크기 기반 수직 배치</li>
              <li><b className="text-slate-200">Radial (R)</b> — 방사형. 선택 노드를 중심으로 동심원 형태 배치, 노드 수에 따라 동적 반경 조절</li>
            </ul>
          </DocSection>

          {/* 8. 미니맵 */}
          <DocSection title="미니맵" icon="🗺️">
            <p>
              캔버스 우하단에 전체 그래프의 축소 뷰가 표시됩니다.
              파란 사각형이 현재 보이는 영역을 나타내며, <b className="text-slate-200">드래그</b>하여 빠르게 다른 영역으로 이동할 수 있습니다.
            </p>
          </DocSection>

          {/* 9. 코드 프리뷰 */}
          <DocSection title="코드 프리뷰" icon="💻">
            <p>
              노드 위에 마우스를 올리면 해당 메소드/함수의 소스 코드 일부가 툴팁으로 표시됩니다.
              파일명, 라인 번호와 함께 전후 5줄의 코드를 미리 볼 수 있습니다.
            </p>
          </DocSection>

          <div className="border-t border-slate-800" />

          {/* 실용 기능 */}
          <div className="text-[11px] font-semibold text-angel-400 uppercase tracking-wide">실용 기능</div>

          {/* 10. PNG 내보내기 */}
          <DocSection title="PNG 내보내기" icon="📷">
            <p>
              우측 하단 다운로드 버튼을 클릭하면 현재 그래프를 PNG 이미지로 저장합니다.
              현재 캔버스에 렌더링된 상태 그대로 내보내집니다.
            </p>
          </DocSection>

          {/* 11. 상속 트리 뷰 */}
          <DocSection title="상속 트리 뷰" icon="🌳">
            <p>
              우측 하단 GitBranch 버튼을 클릭하면 <b className="text-slate-200">extends/implements</b> 관계만 필터링하여
              클래스 계층 구조를 시각화합니다. 상속 관계에 관여하는 노드만 표시되어 계층 구조를 명확히 파악할 수 있습니다.
            </p>
          </DocSection>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-700 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function DocSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[12px] font-semibold text-white">{title}</h3>
      </div>
      <div className="ml-5">{children}</div>
    </div>
  )
}

function DocNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 bg-slate-800/60 border border-slate-700/50 rounded px-2.5 py-1.5 text-[10px] text-slate-400">
      <span className="text-angel-400 font-medium">Note: </span>{children}
    </div>
  )
}
