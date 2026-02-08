import { create } from 'zustand'
import type { ScheduledTask, TaskLog } from '../types'
import {
  getSchedulerTasks,
  createSchedulerTask,
  updateSchedulerTask,
  deleteSchedulerTask,
  toggleSchedulerTask,
  runSchedulerTask,
  getSchedulerLogs,
} from '../api/client'

interface SchedulerState {
  tasks: ScheduledTask[]
  logs: TaskLog[]
  loading: boolean
  running: Record<string, boolean> // task_id → running
  fetchTasks: () => Promise<void>
  fetchLogs: (taskId?: string) => Promise<void>
  addTask: (data: {
    name: string
    prompt: string
    model?: string
    schedule_type?: string
    cron_hour?: number
    cron_minute?: number
    cron_days?: string[]
    interval_minutes?: number
    timezone?: string
    notify_apps?: { whatsapp: boolean; telegram: boolean; matrix: boolean }
  }) => Promise<void>
  editTask: (id: string, data: Record<string, any>) => Promise<void>
  removeTask: (id: string) => Promise<void>
  toggle: (id: string) => Promise<void>
  runNow: (id: string) => Promise<void>
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  tasks: [],
  logs: [],
  loading: false,
  running: {},

  fetchTasks: async () => {
    set({ loading: true })
    try {
      const { tasks } = await getSchedulerTasks()
      set({ tasks })
    } finally {
      set({ loading: false })
    }
  },

  fetchLogs: async (taskId?: string) => {
    const { logs } = await getSchedulerLogs(taskId)
    set({ logs })
  },

  addTask: async (data) => {
    await createSchedulerTask(data)
    await get().fetchTasks()
  },

  editTask: async (id, data) => {
    await updateSchedulerTask(id, data)
    await get().fetchTasks()
  },

  removeTask: async (id) => {
    await deleteSchedulerTask(id)
    await get().fetchTasks()
    await get().fetchLogs()
  },

  toggle: async (id) => {
    await toggleSchedulerTask(id)
    await get().fetchTasks()
  },

  runNow: async (id) => {
    set((s) => ({ running: { ...s.running, [id]: true } }))
    try {
      await runSchedulerTask(id)
      await get().fetchTasks()
      await get().fetchLogs()
    } finally {
      set((s) => {
        const running = { ...s.running }
        delete running[id]
        return { running }
      })
    }
  },
}))
