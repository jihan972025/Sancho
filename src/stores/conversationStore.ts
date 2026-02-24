import { create } from 'zustand'
import type { ConversationSummary } from '../types'
import {
  getConversations,
  createConversation,
  deleteConversationApi,
  renameConversation,
  getConversation,
} from '../api/client'
import { useChatStore } from './chatStore'

interface ConversationState {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  isLoaded: boolean
  isSidebarOpen: boolean

  fetchConversations: () => Promise<void>
  newConversation: (model?: string) => Promise<string>
  loadConversation: (id: string) => Promise<void>
  removeConversation: (id: string) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  setActiveConversationId: (id: string | null) => void
  toggleSidebar: () => void
  refreshAfterMessage: () => Promise<void>
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoaded: false,
  isSidebarOpen: true,

  fetchConversations: async () => {
    try {
      const { conversations } = await getConversations()
      set({ conversations, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  newConversation: async (model = '') => {
    const previousId = get().activeConversationId || ''
    const { conversation } = await createConversation('', model, previousId)
    const summary: ConversationSummary = {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      message_count: 0,
      preview: '',
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    }
    set((s) => ({
      conversations: [summary, ...s.conversations],
      activeConversationId: conversation.id,
    }))
    // Update chatStore with new conversation id
    useChatStore.getState().setConversationId(conversation.id)
    return conversation.id
  },

  loadConversation: async (id: string) => {
    try {
      const { conversation } = await getConversation(id)
      const chatStore = useChatStore.getState()
      chatStore.loadConversationMessages(
        id,
        conversation.messages.map((m: any, i: number) => ({
          id: `conv-${id}-${i}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
          source: m.source || undefined,
        }))
      )
      set({ activeConversationId: id })
    } catch {
      // ignore load errors
    }
  },

  removeConversation: async (id: string) => {
    await deleteConversationApi(id)
    const state = get()
    const updated = state.conversations.filter((c) => c.id !== id)
    set({ conversations: updated })
    if (state.activeConversationId === id) {
      set({ activeConversationId: null })
      useChatStore.getState().clearMessages()
    }
  },

  rename: async (id: string, title: string) => {
    const { conversation } = await renameConversation(id, title)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, ...conversation } : c
      ),
    }))
  },

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

  refreshAfterMessage: async () => {
    try {
      const { conversations } = await getConversations()
      set({ conversations })
    } catch {
      /* ignore */
    }
  },
}))
