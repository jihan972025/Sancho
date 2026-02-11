import { useRef, useEffect, useState } from 'react'
import { Bot, Zap, Brain } from 'lucide-react'
import MessageBubble from './MessageBubble'
import InputBar from './InputBar'
import MemoryPanel from './MemoryPanel'
import { useChatStore } from '../../stores/chatStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { sendMessageStream, stopGeneration } from '../../api/client'

export default function ChatWindow() {
  const [showMemory, setShowMemory] = useState(false)
  const memoryCount = useMemoryStore((s) => s.memories.length)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    selectedModel,
    isStreaming,
    streamingContent,
    skillStatus,
    addMessage,
    setStreaming,
    appendStreamContent,
    finalizeStream,
    setSkillStatus,
  } = useChatStore()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])


  const handleSend = async (content: string) => {
    addMessage({ role: 'user', content })
    setStreaming(true)

    const allMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ]

    await sendMessageStream(
      allMessages,
      selectedModel,
      (token) => appendStreamContent(token),
      () => finalizeStream(),
      (error) => {
        addMessage({ role: 'assistant', content: `Error: ${error}` })
        setStreaming(false)
      },
      (skill) => setSkillStatus(`Using ${skill}...`),
      () => setSkillStatus(null),
      (thinking) => setSkillStatus(thinking),
    )
  }

  const handleStop = () => {
    stopGeneration()
    finalizeStream()
  }

  return (
    <div className="flex flex-col h-full relative">
      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Memory button */}
        <div className="flex justify-end -mb-2">
          <button
            onClick={() => setShowMemory(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-angel-400 transition-colors px-2 py-1 rounded hover:bg-slate-800"
            title="View memories"
          >
            <Brain size={14} />
            {memoryCount > 0 && <span>{memoryCount}</span>}
          </button>
        </div>
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <img src="./logo.svg" alt="Sancho" className="w-20 h-20 mb-4" />
            <h2 className="text-xl font-semibold text-slate-200 mb-2">Sancho</h2>
            <p className="text-slate-400 text-sm max-w-md">
              Your AI assistant for chat, file management, and browser automation.
              Select a model and start a conversation.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
          />
        )}
        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-md px-4 py-3">
              {skillStatus ? (
                <div className="flex items-center gap-2 text-angel-400 text-sm">
                  <Zap size={14} className="animate-pulse" />
                  <span>{skillStatus}</span>
                </div>
              ) : (
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <InputBar onSend={handleSend} onStop={handleStop} />
    </div>
  )
}
