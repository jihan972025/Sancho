import { useState, useRef, useEffect } from 'react'
import { Send, Square, ChevronDown } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

interface Props {
  onSend: (content: string) => void
  onStop: () => void
}

export default function InputBar({ onSend, onStop }: Props) {
  const [input, setInput] = useState('')
  const [showModels, setShowModels] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { models, selectedModel, setSelectedModel, isStreaming } = useChatStore()

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-slate-800 bg-slate-900 p-3">
      <div className="flex items-end gap-2">
        <div className="relative">
          <button
            onClick={() => setShowModels(!showModels)}
            className="h-10 px-3 bg-slate-800 rounded-lg text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-1 whitespace-nowrap"
          >
            {selectedModel}
            <ChevronDown size={12} />
          </button>
          {showModels && (
            <div className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[200px] z-50">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id)
                    setShowModels(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 ${
                    m.id === selectedModel ? 'text-angel-400' : 'text-slate-300'
                  }`}
                >
                  {m.id}
                  <span className="text-slate-500 ml-2">{m.provider}</span>
                </button>
              ))}
              {models.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">
                  No models available. Add API keys in Settings.
                </div>
              )}
            </div>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-500"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="h-10 w-10 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center transition-colors"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="h-10 w-10 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
