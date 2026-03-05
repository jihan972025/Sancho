import { X, FileCode, ArrowRight, Circle, ListOrdered, Zap, AlertTriangle, RefreshCw } from 'lucide-react'
import type { GraphNode, GraphEdge } from './OntologyGraph'

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  allNodes: GraphNode[]
  impactMap: Map<string, number> | null
  onClose: () => void
  onNavigate: (nodeId: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  class: 'Class',
  method: 'Method',
  function: 'Function',
  file: 'File',
  module: 'Module',
  interface: 'Interface',
}

const TYPE_COLORS: Record<string, string> = {
  class: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  method: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  function: 'bg-green-500/20 text-green-400 border-green-500/30',
  file: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  module: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  interface: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const EDGE_TYPE_LABELS: Record<string, string> = {
  calls: 'calls',
  imports: 'imports',
  extends: 'extends',
  implements: 'implements',
  references: 'contains',
}

export default function OntologyProperties({ node, edges, allNodes, impactMap, onClose, onNavigate }: Props) {
  const connectedEdges = edges.filter((e) => e.source === node.id || e.target === node.id)
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  const outgoing = connectedEdges.filter((e) => e.source === node.id)
  const incoming = connectedEdges.filter((e) => e.target === node.id)

  const typeStyle = TYPE_COLORS[node.type] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-slate-700 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white truncate" title={node.label}>
            {node.label}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded border ${typeStyle}`}>
              {TYPE_LABELS[node.type] || node.type}
            </span>
            {node.dead && (
              <span className="inline-block px-1.5 py-0.5 text-[10px] rounded border bg-slate-500/20 text-slate-400 border-slate-500/30">
                Dead
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3 text-xs">
          {/* File info */}
          <div>
            <div className="text-slate-500 mb-1">File</div>
            <div className="flex items-center gap-1 text-slate-300">
              <FileCode size={12} className="text-slate-500 shrink-0" />
              <span className="truncate" title={node.file}>{node.file}</span>
            </div>
            {node.line && (
              <div className="text-slate-500 mt-0.5">Line {node.line}</div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500 text-[10px]">Connections</div>
              <div className="text-white font-medium">{connectedEdges.length}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500 text-[10px]">Cluster</div>
              <div className="text-white font-medium">#{node.cluster}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500 text-[10px]">Fan-in</div>
              <div className="text-white font-medium">{node.fanIn ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500 text-[10px]">Fan-out</div>
              <div className="text-white font-medium">{node.fanOut ?? 0}</div>
            </div>
            {(node.lines ?? 0) > 0 && (
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-500 text-[10px]">Lines</div>
                <div className="text-white font-medium">{node.lines}</div>
              </div>
            )}
          </div>

          {/* Circular Dependencies */}
          {(() => {
            // Find circular edges connected to this node
            const circularOut = outgoing.filter(e => e.circular)
            const circularIn = incoming.filter(e => e.circular)
            if (circularOut.length === 0 && circularIn.length === 0) return null

            // Trace cycle paths: for each circular outgoing edge, trace forward to find the loop back
            const cyclePaths: { path: string[]; edgeTypes: string[] }[] = []
            for (const ce of circularOut) {
              const path = [node.id, ce.target]
              const edgeTypes = [ce.type]
              const visited = new Set([node.id])
              let current = ce.target
              let found = false
              for (let step = 0; step < 10 && !found; step++) {
                const nextEdge = edges.find(e => e.source === current && !visited.has(e.target))
                if (!nextEdge) break
                if (nextEdge.target === node.id) {
                  edgeTypes.push(nextEdge.type)
                  found = true
                } else {
                  visited.add(nextEdge.target)
                  path.push(nextEdge.target)
                  edgeTypes.push(nextEdge.type)
                  current = nextEdge.target
                }
              }
              if (found) cyclePaths.push({ path, edgeTypes })
            }

            return (
              <div>
                <div className="text-red-400 mb-1.5 flex items-center gap-1 font-medium">
                  <AlertTriangle size={10} />
                  Circular Dependencies ({circularOut.length + circularIn.length})
                </div>

                {/* Show cycle paths */}
                {cyclePaths.length > 0 && cyclePaths.map((cp, ci) => (
                  <div key={ci} className="mb-2 bg-red-950/30 border border-red-900/40 rounded p-2">
                    <div className="text-[10px] text-red-400/70 mb-1 flex items-center gap-1">
                      <RefreshCw size={8} />
                      Cycle Path
                    </div>
                    <div className="space-y-0.5">
                      {cp.path.map((nid, pi) => {
                        const pn = nodeMap.get(nid)
                        if (!pn) return null
                        return (
                          <div key={pi} className="flex items-center gap-1">
                            <button
                              className="flex items-center gap-1 text-left hover:text-white text-red-300 text-[11px]"
                              onClick={() => onNavigate(nid)}
                            >
                              <span className="truncate">{pn.label}</span>
                            </button>
                            {pi < cp.path.length - 1 && (
                              <span className="text-red-500/60 text-[9px]">→ {cp.edgeTypes[pi]}</span>
                            )}
                          </div>
                        )
                      })}
                      <div className="flex items-center gap-1 text-red-500/60 text-[9px]">
                        <span>→ {cp.edgeTypes[cp.edgeTypes.length - 1]} →</span>
                        <span className="text-red-300 text-[11px]">{node.label}</span>
                        <span className="text-red-500/50">(loop)</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Circular outgoing */}
                {circularOut.length > 0 && (
                  <div className="space-y-0.5">
                    {circularOut.map((e, i) => {
                      const target = nodeMap.get(e.target)
                      if (!target) return null
                      return (
                        <button
                          key={`co-${i}`}
                          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-red-900/30 text-red-300 hover:text-red-200"
                          onClick={() => onNavigate(e.target)}
                        >
                          <ArrowRight size={8} className="shrink-0 text-red-500" />
                          <span className="truncate">{target.label}</span>
                          <span className="text-red-500/60 ml-auto shrink-0">{EDGE_TYPE_LABELS[e.type] || e.type}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Circular incoming */}
                {circularIn.length > 0 && (
                  <div className="space-y-0.5 mt-0.5">
                    {circularIn.map((e, i) => {
                      const source = nodeMap.get(e.source)
                      if (!source) return null
                      return (
                        <button
                          key={`ci-${i}`}
                          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-red-900/30 text-red-300 hover:text-red-200"
                          onClick={() => onNavigate(e.source)}
                        >
                          <ArrowRight size={8} className="shrink-0 text-red-500 rotate-180" />
                          <span className="truncate">{source.label}</span>
                          <span className="text-red-500/60 ml-auto shrink-0">{EDGE_TYPE_LABELS[e.type] || e.type}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Impact Analysis */}
          {impactMap && impactMap.size > 1 && (
            <div>
              <div className="text-slate-500 mb-1.5 flex items-center gap-1">
                <Zap size={10} />
                Impact Analysis
              </div>
              {[1, 2, 3].map(depth => {
                const nodesAtDepth = allNodes.filter(n => impactMap.get(n.id) === depth)
                if (nodesAtDepth.length === 0) return null
                const depthColors = ['text-orange-400', 'text-orange-500/70', 'text-orange-600/50']
                return (
                  <div key={depth} className="mb-1.5">
                    <div className={`text-[10px] mb-0.5 ${depthColors[depth - 1]}`}>
                      Depth {depth} ({nodesAtDepth.length})
                    </div>
                    <div className="space-y-0.5">
                      {nodesAtDepth.slice(0, 8).map(n => (
                        <button
                          key={n.id}
                          className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded hover:bg-slate-700/50 text-slate-300 hover:text-white"
                          onClick={() => onNavigate(n.id)}
                        >
                          <Circle size={5} className="shrink-0" style={{ color: getClusterColor(n.cluster) }} />
                          <span className="truncate text-[11px]">{n.label}</span>
                        </button>
                      ))}
                      {nodesAtDepth.length > 8 && (
                        <div className="text-slate-600 text-[10px] px-2">+{nodesAtDepth.length - 8} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Call Sequence (for method/function nodes) */}
          {(node.type === 'method' || node.type === 'function') && (() => {
            const callEdges = outgoing
              .filter((e) => e.type === 'calls' && e.order != null)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            if (callEdges.length === 0) return null
            return (
              <div>
                <div className="text-slate-500 mb-1.5 flex items-center gap-1">
                  <ListOrdered size={10} />
                  Call Sequence ({callEdges.length})
                </div>
                <div className="space-y-0.5">
                  {callEdges.map((e, i) => {
                    const target = nodeMap.get(e.target)
                    if (!target) return null
                    return (
                      <button
                        key={i}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-slate-700/50 text-slate-300 hover:text-white"
                        onClick={() => onNavigate(e.target)}
                      >
                        <span className="shrink-0 w-4 h-4 rounded-full bg-orange-500/80 text-[9px] font-bold text-black flex items-center justify-center">
                          {(e.order ?? 0) + 1}
                        </span>
                        <span className="truncate">{target.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Outgoing connections */}
          {outgoing.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1.5 flex items-center gap-1">
                <ArrowRight size={10} />
                Outgoing ({outgoing.length})
              </div>
              <div className="space-y-0.5">
                {outgoing.map((e, i) => {
                  const target = nodeMap.get(e.target)
                  if (!target) return null
                  return (
                    <button
                      key={i}
                      className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded ${e.circular ? 'hover:bg-red-900/30 text-red-300 hover:text-red-200' : 'hover:bg-slate-700/50 text-slate-300 hover:text-white'}`}
                      onClick={() => onNavigate(e.target)}
                    >
                      {e.circular
                        ? <AlertTriangle size={6} className="shrink-0 text-red-500" />
                        : <Circle size={6} className="shrink-0" style={{ color: getClusterColor(target.cluster) }} />
                      }
                      <span className="truncate">{target.label}</span>
                      <span className={`ml-auto shrink-0 ${e.circular ? 'text-red-500/60' : 'text-slate-600'}`}>{EDGE_TYPE_LABELS[e.type] || e.type}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Incoming connections */}
          {incoming.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1.5 flex items-center gap-1">
                <ArrowRight size={10} className="rotate-180" />
                Incoming ({incoming.length})
              </div>
              <div className="space-y-0.5">
                {incoming.map((e, i) => {
                  const source = nodeMap.get(e.source)
                  if (!source) return null
                  return (
                    <button
                      key={i}
                      className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded ${e.circular ? 'hover:bg-red-900/30 text-red-300 hover:text-red-200' : 'hover:bg-slate-700/50 text-slate-300 hover:text-white'}`}
                      onClick={() => onNavigate(e.source)}
                    >
                      {e.circular
                        ? <AlertTriangle size={6} className="shrink-0 text-red-500" />
                        : <Circle size={6} className="shrink-0" style={{ color: getClusterColor(source.cluster) }} />
                      }
                      <span className="truncate">{source.label}</span>
                      <span className={`ml-auto shrink-0 ${e.circular ? 'text-red-500/60' : 'text-slate-600'}`}>{EDGE_TYPE_LABELS[e.type] || e.type}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {connectedEdges.length === 0 && (
            <div className="text-slate-500 text-center py-4">No connections</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Reuse cluster color palette
const CLUSTER_COLORS = [
  '#C9A961', '#4A9FD8', '#9BC816', '#C653E1', '#E07B54',
  '#58C9B9', '#D94F6B', '#7B8CDE', '#B8D44E', '#E8A0BF',
]

function getClusterColor(cluster: number): string {
  return CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
}
