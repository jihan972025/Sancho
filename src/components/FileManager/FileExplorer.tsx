import { useState, useEffect } from 'react'
import {
  Folder,
  File,
  ArrowUp,
  RefreshCw,
  Trash2,
  FolderPlus,
  FilePlus,
  Wand2,
} from 'lucide-react'
import FileActions from './FileActions'
import { listFiles, requestDelete, confirmDelete, createFile, createDirectory, organizeFiles } from '../../api/client'
import type { FileInfo, DeleteToken } from '../../types'

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState('C:\\')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteToken, setDeleteToken] = useState<DeleteToken | null>(null)
  const [organizing, setOrganizing] = useState(false)

  const loadFiles = async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const { items } = await listFiles(path)
      setFiles(items)
      setCurrentPath(path)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadFiles(currentPath)
  }, [])

  const navigateUp = () => {
    const parent = currentPath.replace(/\\[^\\]+\\?$/, '')
    if (parent && parent !== currentPath) {
      loadFiles(parent.endsWith('\\') ? parent : parent + '\\')
    }
  }

  const handleOpen = (file: FileInfo) => {
    if (file.is_dir) {
      loadFiles(file.path)
    }
  }

  const handleDelete = async (file: FileInfo) => {
    try {
      const token = await requestDelete(file.path)
      setDeleteToken(token)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteToken) return
    try {
      await confirmDelete(deleteToken.token)
      setDeleteToken(null)
      loadFiles(currentPath)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:')
    if (!name) return
    try {
      await createFile(currentPath + '\\' + name, true)
      loadFiles(currentPath)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleCreateFile = async () => {
    const name = prompt('File name:')
    if (!name) return
    try {
      await createFile(currentPath + '\\' + name, false)
      loadFiles(currentPath)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleOrganize = async () => {
    const instructions = prompt('Organization instructions (optional):') || ''
    setOrganizing(true)
    try {
      await organizeFiles(currentPath, undefined, instructions)
      loadFiles(currentPath)
    } catch (err: any) {
      alert(err.message)
    }
    setOrganizing(false)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0">
        <button
          onClick={navigateUp}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          title="Go up"
        >
          <ArrowUp size={16} />
        </button>
        <div className="flex-1 bg-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-mono truncate">
          {currentPath}
        </div>
        <button
          onClick={() => loadFiles(currentPath)}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={handleCreateFolder}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          title="New folder"
        >
          <FolderPlus size={16} />
        </button>
        <button
          onClick={handleCreateFile}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          title="New file"
        >
          <FilePlus size={16} />
        </button>
        <button
          onClick={handleOrganize}
          disabled={organizing}
          className="p-2 hover:bg-slate-800 rounded-lg text-angel-400 hover:text-angel-300 disabled:opacity-50"
          title="AI Organize"
        >
          <Wand2 size={16} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
            Loading...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-8 text-red-400 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
            Empty directory
          </div>
        )}
        {files.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800/50 cursor-pointer group"
            onDoubleClick={() => handleOpen(file)}
          >
            {file.is_dir ? (
              <Folder size={18} className="text-angel-400 shrink-0" />
            ) : (
              <File size={18} className="text-slate-400 shrink-0" />
            )}
            <span className="flex-1 text-sm text-slate-300 truncate">
              {file.name}
            </span>
            <span className="text-xs text-slate-500 w-20 text-right">
              {file.is_dir ? '' : formatSize(file.size)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(file)
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <FileActions
        deleteToken={deleteToken}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteToken(null)}
      />
    </div>
  )
}
