import { useRef, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { useP2PChatStore } from '../../stores/p2pChatStore'
import { useTranslation } from 'react-i18next'

export default function P2PChatMessageArea() {
  const { t } = useTranslation()
  const { messages, username, connected, sendMessage } = useP2PChatStore()
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    if (!input.trim() || !connected) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            {t('p2pchat.noMessages')}
          </div>
        )}

        {messages.map((msg) => {
          // System messages (join/leave)
          if (msg.type === 'join' || msg.type === 'leave') {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
                  {msg.type === 'join'
                    ? t('p2pchat.joinedRoom', { username: msg.username })
                    : t('p2pchat.leftRoom', { username: msg.username })}
                </span>
              </div>
            )
          }

          // Regular messages
          const isMe = msg.username === username
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] ${isMe ? 'order-1' : ''}`}>
                {!isMe && (
                  <div className="text-xs text-slate-400 mb-0.5 ml-1">{msg.username}</div>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-angel-600 text-white rounded-br-md'
                      : 'bg-slate-700 text-slate-200 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
                <div className={`text-[10px] text-slate-500 mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-slate-700/50 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected}
            placeholder={connected ? t('p2pchat.messagePlaceholder') : t('p2pchat.disconnected')}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-angel-500 disabled:opacity-50"
            rows={1}
            style={{ maxHeight: 80 }}
          />
          <button
            onClick={handleSend}
            disabled={!connected || !input.trim()}
            className="p-2 bg-angel-600 hover:bg-angel-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
