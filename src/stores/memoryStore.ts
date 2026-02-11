import { create } from 'zustand'
import type { Memory } from '../types'
import { getMemories, deleteMemory, toggleMemory, clearAllMemories } from '../api/client'

interface MemoryState {
  memories: Memory[]
  isLoaded: boolean
  fetchMemories: () => Promise<void>
  removeMemory: (id: string) => Promise<void>
  toggleMemoryEnabled: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  isLoaded: false,

  fetchMemories: async () => {
    try {
      const { memories } = await getMemories()
      set({ memories, isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  removeMemory: async (id) => {
    await deleteMemory(id)
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
  },

  toggleMemoryEnabled: async (id) => {
    const { memory } = await toggleMemory(id)
    set((s) => ({
      memories: s.memories.map((m) => (m.id === id ? memory : m)),
    }))
  },

  clearAll: async () => {
    await clearAllMemories()
    set({ memories: [] })
  },
}))
