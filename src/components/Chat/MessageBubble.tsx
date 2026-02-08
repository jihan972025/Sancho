import { User, MessageCircle, Send, Globe } from 'lucide-react'
import type { Message } from '../../types'

interface Props {
  message: Message
}

const sourceConfig: Record<string, { color: string; avatarColor: string; icon: typeof Send; label: string }> = {
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
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  )
}
