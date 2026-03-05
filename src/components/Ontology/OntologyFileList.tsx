import { FolderOpen, FileCode, ChevronRight, ChevronDown, Search } from 'lucide-react'
import { useState, useMemo } from 'react'

interface FileEntry {
  path: string
  ext: string
}

interface Props {
  folderPath: string
  files: FileEntry[]
  loading: boolean
  highlightFile: string | null
  onSelectFolder: () => void
  onHighlightFile: (file: string | null) => void
}

// Build a simple tree from flat file paths
interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  ext?: string
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }

  for (const f of files) {
    const parts = f.path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      let child = current.children.find((c) => c.name === name)
      if (!child) {
        child = {
          name,
          path: isLast ? f.path : parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          children: [],
          ext: isLast ? f.ext : undefined,
        }
        current.children.push(child)
      }
      current = child
    }
  }

  // Sort: dirs first, then alphabetical
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => sortTree(n.children))
  }
  sortTree(root.children)
  return root.children
}

const EXT_COLORS: Record<string, string> = {
  '.java': 'text-orange-400',
  '.py': 'text-yellow-400',
  '.ts': 'text-blue-400',
  '.tsx': 'text-blue-400',
  '.js': 'text-yellow-300',
  '.jsx': 'text-yellow-300',
  '.go': 'text-cyan-400',
  '.c': 'text-gray-400',
  '.cpp': 'text-gray-400',
  '.h': 'text-gray-400',
}

function TreeItem({
  node,
  depth,
  highlightFile,
  onHighlightFile,
}: {
  node: TreeNode
  depth: number
  highlightFile: string | null
  onHighlightFile: (file: string | null) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isHighlighted = highlightFile === node.path

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full text-left px-2 py-0.5 hover:bg-slate-700/50 text-xs text-slate-300"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <FolderOpen size={12} className="text-amber-400" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            highlightFile={highlightFile}
            onHighlightFile={onHighlightFile}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      className={`flex items-center gap-1 w-full text-left px-2 py-0.5 text-xs truncate ${
        isHighlighted
          ? 'bg-angel-600/30 text-white'
          : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onHighlightFile(isHighlighted ? null : node.path)}
    >
      <FileCode size={12} className={EXT_COLORS[node.ext || ''] || 'text-slate-500'} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export default function OntologyFileList({
  folderPath,
  files,
  loading,
  highlightFile,
  onSelectFolder,
  onHighlightFile,
}: Props) {
  const [filter, setFilter] = useState('')
  const tree = useMemo(() => {
    const filtered = filter
      ? files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))
      : files
    return buildTree(filtered)
  }, [files, filter])

  return (
    <div className="flex flex-col h-full">
      {/* Folder selector */}
      <div className="p-2 border-b border-slate-700">
        <button
          onClick={onSelectFolder}
          className="flex items-center gap-2 w-full px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded text-xs text-slate-200 transition-colors"
        >
          <FolderOpen size={14} className="text-angel-400 shrink-0" />
          <span className="truncate">{folderPath || 'Select folder...'}</span>
        </button>
      </div>

      {/* Search */}
      {files.length > 0 && (
        <div className="p-2 border-b border-slate-700">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files..."
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 pl-7 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500"
            />
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-xs text-slate-500">
            <div className="animate-spin w-4 h-4 border-2 border-angel-500 border-t-transparent rounded-full mr-2" />
            Analyzing...
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-slate-500">
            {folderPath ? 'No source files found' : 'Select a folder to analyze'}
          </div>
        ) : (
          <div className="py-1">
            {highlightFile && (
              <button
                onClick={() => onHighlightFile(null)}
                className="w-full text-left px-3 py-1 text-xs text-angel-400 hover:text-angel-300 border-b border-slate-700/50"
              >
                Clear filter
              </button>
            )}
            {tree.map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                highlightFile={highlightFile}
                onHighlightFile={onHighlightFile}
              />
            ))}
            <div className="px-3 py-2 text-xs text-slate-600">
              {files.length} files
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
