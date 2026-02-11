import { useEffect } from 'react'
import { Brain, X, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useMemoryStore } from '../../stores/memoryStore'

const CATEGORY_COLORS: Record<string, string> = {
  fact: 'bg-blue-500/20 text-blue-400',
  preference: 'bg-purple-500/20 text-purple-400',
  instruction: 'bg-amber-500/20 text-amber-400',
}

export default function MemoryPanel({ onClose }: { onClose: () => void }) {
  const { memories, isLoaded, fetchMemories, removeMemory, toggleMemoryEnabled, clearAll } =
    useMemoryStore()

  useEffect(() => {
    if (!isLoaded) fetchMemories()
  }, [isLoaded, fetchMemories])

  const handleClearAll = async () => {
    if (confirm('Delete all memories? This cannot be undone.')) {
      await clearAll()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-96 max-w-full h-full bg-slate-850 border-l border-slate-700 flex flex-col shadow-2xl" style={{ backgroundColor: '#111827' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-angel-400" />
            <span className="text-sm font-medium text-slate-200">Memory</span>
            <span className="text-xs text-slate-500">({memories.length})</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X size={16} />
          </button>
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!isLoaded ? (
            <div className="text-center text-slate-500 text-sm py-8">Loading...</div>
          ) : memories.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              <Brain size={32} className="mx-auto mb-2 opacity-30" />
              <p>No memories yet.</p>
              <p className="text-xs mt-1">
                Chat with the AI and it will automatically remember important facts.
              </p>
            </div>
          ) : (
            memories.map((mem) => (
              <div
                key={mem.id}
                className={`rounded-lg border p-3 text-sm transition-opacity ${
                  mem.enabled
                    ? 'bg-slate-800/60 border-slate-700'
                    : 'bg-slate-800/30 border-slate-700/50 opacity-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span
                      className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-1 ${
                        CATEGORY_COLORS[mem.category] || CATEGORY_COLORS.fact
                      }`}
                    >
                      {mem.category}
                    </span>
                    <p className="text-slate-300 leading-snug">{mem.content}</p>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {new Date(mem.created_at).toLocaleDateString()} &middot; {mem.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMemoryEnabled(mem.id)}
                      className="text-slate-500 hover:text-slate-300 p-1"
                      title={mem.enabled ? 'Disable' : 'Enable'}
                    >
                      {mem.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => removeMemory(mem.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {memories.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-700">
            <button
              onClick={handleClearAll}
              className="w-full text-xs text-red-400 hover:text-red-300 py-1.5 rounded border border-red-500/30 hover:border-red-500/50 transition-colors"
            >
              Clear all memories
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
