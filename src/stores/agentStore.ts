import { create } from 'zustand'
import type { BrowserAgentState } from '../types'

interface AgentState {
  browserAgent: BrowserAgentState
  lastScreenshot: string | null
  setBrowserState: (state: Partial<BrowserAgentState>) => void
  setScreenshot: (b64: string | null) => void
  resetAgent: () => void
}

const initialBrowserState: BrowserAgentState = {
  status: 'idle',
  current_step: 0,
  max_steps: 20,
  task: '',
  last_action: '',
  last_thought: '',
  error: null,
  result: null,
  last_snapshot: null,
}

export const useAgentStore = create<AgentState>((set) => ({
  browserAgent: { ...initialBrowserState },
  lastScreenshot: null,

  setBrowserState: (state) =>
    set((prev) => ({
      browserAgent: { ...prev.browserAgent, ...state },
    })),

  setScreenshot: (b64) => set({ lastScreenshot: b64 }),

  resetAgent: () =>
    set({ browserAgent: { ...initialBrowserState }, lastScreenshot: null }),
}))
