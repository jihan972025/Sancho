import { useState, useEffect } from 'react'
import { Download, X, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

type PatchState = 'idle' | 'available' | 'downloading' | 'success' | 'error'

interface PatchInfo {
  version: string
  notes: string
  patchSize: number
  channels: string[]
  fullOnly: boolean
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PatchNotification() {
  const [state, setState] = useState<PatchState>('idle')
  const [patchInfo, setPatchInfo] = useState<PatchInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentChannel, setCurrentChannel] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const api = (window as any).electronAPI?.patch
    if (!api) return

    api.removeListeners()

    api.onAvailable((info: PatchInfo) => {
      setPatchInfo(info)
      setState('available')
    })

    api.onProgress((info: { percent: number; channel?: string }) => {
      setProgress(info.percent)
      if (info.channel) setCurrentChannel(info.channel)
    })

    api.onApplied(() => {
      setState('success')
    })

    return () => {
      api.removeListeners()
    }
  }, [])

  const handleUpdate = async () => {
    const api = (window as any).electronAPI?.patch
    if (!api) return

    setState('downloading')
    setProgress(0)
    setCurrentChannel('')
    const result = await api.apply()
    if (!result.success) {
      setError(result.error || 'Update failed')
      setState('error')
    }
  }

  const handleDismiss = () => {
    const api = (window as any).electronAPI?.patch
    if (patchInfo?.version) {
      api?.dismiss(patchInfo.version)
    }
    setState('idle')
    setPatchInfo(null)
    setError('')
  }

  if (state === 'idle') return null

  const sizeLabel = patchInfo ? formatSize(patchInfo.patchSize) : ''
  const isPatch = patchInfo && !patchInfo.fullOnly && patchInfo.channels && patchInfo.channels.length > 0

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl shadow-black/40 w-80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            {state === 'available' && <Download size={16} className="text-angel-400" />}
            {state === 'downloading' && <RefreshCw size={16} className="text-angel-400 animate-spin" />}
            {state === 'success' && <CheckCircle size={16} className="text-emerald-400" />}
            {state === 'error' && <AlertCircle size={16} className="text-red-400" />}
            <span className="text-sm font-medium text-slate-200">
              {state === 'available' && 'Update Available'}
              {state === 'downloading' && 'Updating...'}
              {state === 'success' && 'Update Complete'}
              {state === 'error' && 'Update Failed'}
            </span>
          </div>
          {(state === 'available' || state === 'error') && (
            <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-200">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {state === 'available' && patchInfo && (
            <div className="mb-3">
              <p className="text-xs text-slate-400">
                v{patchInfo.version} is ready to install.
              </p>
              {sizeLabel && (
                <p className="text-xs text-slate-500 mt-1">
                  {isPatch ? (
                    <>
                      <span className="text-angel-400">{sizeLabel}</span>
                      <span className="text-slate-600"> · </span>
                      {patchInfo.channels.join(', ')}
                    </>
                  ) : (
                    <span>{sizeLabel}</span>
                  )}
                </p>
              )}
            </div>
          )}

          {state === 'downloading' && (
            <div className="mb-2">
              <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1">
                <div
                  className="bg-angel-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between">
                {currentChannel && (
                  <p className="text-xs text-slate-500">{currentChannel}</p>
                )}
                <p className="text-xs text-slate-500 text-right ml-auto">{progress}%</p>
              </div>
            </div>
          )}

          {state === 'success' && (
            <p className="text-xs text-slate-400 mb-3">
              Installing update... The app will restart shortly.
            </p>
          )}

          {state === 'error' && (
            <p className="text-xs text-red-400 mb-3">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            {state === 'available' && (
              <>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={handleUpdate}
                  className="px-3 py-1.5 text-xs bg-angel-600 hover:bg-angel-700 text-white rounded-lg transition-colors"
                >
                  Update{sizeLabel ? ` (${sizeLabel})` : ''}
                </button>
              </>
            )}
            {state === 'success' && (
              <p className="text-xs text-emerald-400 animate-pulse">Applying update...</p>
            )}
            {state === 'error' && (
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
