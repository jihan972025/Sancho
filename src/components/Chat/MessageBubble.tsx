import { User, MessageCircle, Send, Globe, Mic } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '../../types'

interface Props {
  message: Message
}

const sourceConfig: Record<string, { color: string; avatarColor: string; icon: typeof Send; label: string }> = {
  voice: { color: 'bg-amber-600', avatarColor: 'bg-amber-600', icon: Mic, label: 'Voice' },
  whatsapp: { color: 'bg-green-600', avatarColor: 'bg-green-600', icon: MessageCircle, label: 'WhatsApp' },
  telegram: { color: 'bg-blue-500', avatarColor: 'bg-blue-500', icon: Send, label: 'Telegram' },
  matrix: { color: 'bg-purple-600', avatarColor: 'bg-purple-600', icon: Globe, label: 'Matrix' },
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'
  const src = message.source && sourceConfig[message.source]

  const bubbleColor = isUser
    ? src ? `${src.color} text-white rounded-tr-md` : 'bg-angel-600 text-white rounded-tr-md'
    : 'bg-slate-800 text-slate-200 rounded-tl-md'

  const avatarColor = isUser
    ? src ? src.avatarColor : 'bg-angel-600'
    : 'bg-slate-700'

  const Icon = isUser ? (src ? src.icon : User) : null

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${avatarColor}`}>
        {Icon ? <Icon size={16} /> : <img src="./logo.svg" alt="Sancho" className="w-5 h-5" />}
      </div>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${bubbleColor}`}>
        {src && <div className="text-[10px] opacity-70 mb-0.5">{src.label}</div>}
        <div className="whitespace-pre-wrap break-words prose prose-sm prose-invert max-w-none
          prose-a:text-angel-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-angel-300
          prose-strong:text-inherit prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0
          prose-headings:text-inherit prose-headings:my-1 prose-hr:my-2 prose-pre:my-1
          prose-code:text-angel-300 prose-code:bg-slate-700/50 prose-code:px-1 prose-code:rounded
          prose-table:my-1 prose-th:text-slate-300 prose-td:text-slate-400">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
