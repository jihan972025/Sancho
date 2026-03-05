import { useState, useCallback } from 'react'
import OntologyGraph, { type GraphNode, type GraphEdge } from './OntologyGraph'
import OntologyFileList from './OntologyFileList'
import OntologyProperties from './OntologyProperties'
import { analyzeOntology, listOntologyFiles } from '../../api/client'
import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react'

interface FileEntry {
  path: string
  ext: string
}

export default function OntologyPanel() {
  const [folderPath, setFolderPath] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [highlightFile, setHighlightFile] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectFolder = useCallback(async () => {
    try {
      let folder: string | null = null

      // Try Electron dialog first
      if (window.electronAPI?.selectFolder) {
        folder = await window.electronAPI.selectFolder()
      } else {
        // Fallback: prompt for path
        folder = prompt('Enter folder path:')
      }

      if (!folder) return
      setFolderPath(folder)
      setError(null)
      setLoading(true)
      setSelectedNode(null)
      setHighlightFile(null)

      // Fetch file list and analysis in parallel
      const [fileResult, graphResult] = await Promise.all([
        listOntologyFiles(folder),
        analyzeOntology(folder),
      ])

      setFiles(fileResult.files)

      // Initialize graph nodes with positions
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
    } catch (err: any) {
      setError(err.message || 'Failed to analyze folder')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleNavigateToNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) setSelectedNode(node)
  }, [nodes])

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
          onHighlightFile={setHighlightFile}
        />
      </div>

      {/* Center: Graph Canvas */}
      <div className="flex-1 relative">
        {error && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded">
            {error}
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
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNode?.id ?? null}
            highlightFile={highlightFile}
            onSelectNode={handleSelectNode}
          />
        )}

        {/* Graph controls overlay */}
        {nodes.length > 0 && (
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <button
              className="w-7 h-7 bg-slate-800/80 hover:bg-slate-700 rounded flex items-center justify-center text-slate-400 hover:text-white"
              title="Zoom In"
              onClick={() => {/* handled by mouse wheel */}}
            >
              <ZoomIn size={14} />
            </button>
            <button
              className="w-7 h-7 bg-slate-800/80 hover:bg-slate-700 rounded flex items-center justify-center text-slate-400 hover:text-white"
              title="Zoom Out"
              onClick={() => {/* handled by mouse wheel */}}
            >
              <ZoomOut size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Right: Properties Panel */}
      {selectedNode && (
        <div className="w-72 border-l border-slate-700 bg-slate-900 shrink-0">
          <OntologyProperties
            node={selectedNode}
            edges={edges}
            allNodes={nodes}
            onClose={() => setSelectedNode(null)}
            onNavigate={handleNavigateToNode}
          />
        </div>
      )}
    </div>
  )
}
