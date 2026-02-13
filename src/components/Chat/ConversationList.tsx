import { useEffect, useState } from 'react'
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  PanelLeftClose,
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversationStore'
import { useChatStore } from '../../stores/chatStore'

export default function ConversationList() {
  const {
    conversations,
    activeConversationId,
    isLoaded,
    fetchConversations,
    newConversation,
    loadConversation,
    removeConversation,
    rename,
    toggleSidebar,
  } = useConversationStore()

  const selectedModel = useChatStore((s) => s.selectedModel)
  const clearMessages = useChatStore((s) => s.clearMessages)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    if (!isLoaded) fetchConversations()
  }, [isLoaded, fetchConversations])

  const handleNew = async () => {
    clearMessages()
    await newConversation(selectedModel)
  }

  const handleSelect = async (id: string) => {
    if (id === activeConversationId) return
    await loadConversation(id)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await removeConversation(id)
  }

  const handleStartRename = (
    e: React.MouseEvent,
    id: string,
    title: string
  ) => {
    e.stopPropagation()
    setEditingId(id)
    setEditTitle(title)
  }

  const handleConfirmRename = async () => {
    if (editingId && editTitle.trim()) {
      await rename(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-800">
        <span className="text-sm font-medium text-slate-300">
          Conversations
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleNew}
            className="p-1.5 text-slate-400 hover:text-angel-400 hover:bg-slate-800 rounded transition-colors"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Hide panel"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {!isLoaded ? (
          <div className="text-center text-slate-500 text-xs py-8">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8 px-4">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
            <p>No conversations yet.</p>
            <p className="mt-1 text-slate-600">
              Start chatting to create one.
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={`group px-3 py-2 cursor-pointer flex items-start gap-2 border-l-2 transition-colors ${
                conv.id === activeConversationId
                  ? 'border-angel-500 bg-slate-800/50'
                  : 'border-transparent hover:bg-slate-800/30'
              }`}
            >
              <div className="flex-1 min-w-0">
                {editingId === conv.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="text-xs bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded flex-1 min-w-0 outline-none focus:ring-1 focus:ring-angel-500"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConfirmRename()
                      }}
                      className="text-green-400 p-0.5 hover:text-green-300"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(null)
                      }}
                      className="text-slate-400 p-0.5 hover:text-slate-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-200 truncate">
                      {conv.title}
                    </div>
                    {conv.preview && (
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {conv.preview}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {formatDate(conv.updated_at)} &middot;{' '}
                      {conv.message_count} msgs
                    </div>
                  </>
                )}
              </div>
              {/* Action buttons on hover */}
              {editingId !== conv.id && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-0.5">
                  <button
                    onClick={(e) =>
                      handleStartRename(e, conv.id, conv.title)
                    }
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
