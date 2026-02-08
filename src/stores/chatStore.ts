import { create } from 'zustand'
import type { Message, ModelInfo } from '../types'

interface ChatState {
  messages: Message[]
  models: ModelInfo[]
  selectedModel: string
  isStreaming: boolean
  streamingContent: string
  skillStatus: string | null
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  setModels: (models: ModelInfo[]) => void
  setSelectedModel: (model: string) => void
  setStreaming: (streaming: boolean) => void
  appendStreamContent: (content: string) => void
  finalizeStream: () => void
  clearMessages: () => void
  setSkillStatus: (status: string | null) => void
}

let msgCounter = 0

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  models: [],
  selectedModel: '',
  isStreaming: false,
  streamingContent: '',
  skillStatus: null,

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: `msg-${++msgCounter}`, timestamp: Date.now() },
      ],
    })),

  setModels: (models) => set({ models }),

  setSelectedModel: (model) => {
    set({ selectedModel: model })
    window.electronAPI?.setSelectedModel(model)
  },

  setStreaming: (streaming) =>
    set({ isStreaming: streaming, streamingContent: streaming ? '' : get().streamingContent }),

  appendStreamContent: (content) =>
    set((state) => ({ streamingContent: state.streamingContent + content })),

  finalizeStream: () => {
    const content = get().streamingContent
    if (content) {
      get().addMessage({ role: 'assistant', content })
    }
    set({ isStreaming: false, streamingContent: '', skillStatus: null })
  },

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  setSkillStatus: (status) => set({ skillStatus: status }),
}))
