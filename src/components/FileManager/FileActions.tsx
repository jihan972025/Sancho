import { AlertTriangle, X } from 'lucide-react'
import type { DeleteToken } from '../../types'

interface Props {
  deleteToken: DeleteToken | null
  onConfirm: () => void
  onCancel: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function FileActions({ deleteToken, onConfirm, onCancel }: Props) {
  if (!deleteToken) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              Confirm Deletion
            </h3>
            <p className="text-sm text-slate-400">
              This will permanently delete:
            </p>
          </div>
          <button
            onClick={onCancel}
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-slate-900 rounded-lg p-3 mb-4 text-sm">
          <p className="text-slate-300 font-mono truncate mb-2">{deleteToken.path}</p>
          <div className="flex gap-4 text-slate-400">
            <span>{deleteToken.item_count} item(s)</span>
            <span>{formatBytes(deleteToken.total_size)}</span>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
