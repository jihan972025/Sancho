import { create } from 'zustand'

// Sidebar tab IDs that can be toggled (settings is always visible)
export type FeatureId = 'chat' | 'crypto' | 'scheduler' | 'ontology' | 'p2pchat' | 'logs'

const STORAGE_KEY = 'sancho-feature-visibility'

function loadVisibility(): Record<FeatureId, boolean> {
  const defaults: Record<FeatureId, boolean> = {
    chat: true,
    crypto: true,
    scheduler: true,
    ontology: true,
    p2pchat: true,
    logs: true,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...defaults, ...parsed }
    }
  } catch { /* ignore */ }
  return defaults
}

interface FeatureState {
  visibility: Record<FeatureId, boolean>
  isVisible: (id: string) => boolean
  setVisible: (id: FeatureId, visible: boolean) => void
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  visibility: loadVisibility(),

  isVisible: (id: string) => {
    if (id === 'settings') return true
    return get().visibility[id as FeatureId] ?? true
  },

  setVisible: (id: FeatureId, visible: boolean) => {
    set((state) => {
      const updated = { ...state.visibility, [id]: visible }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return { visibility: updated }
    })
  },
}))
