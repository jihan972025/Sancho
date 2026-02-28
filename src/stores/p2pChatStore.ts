import { create } from 'zustand'
import type { P2PChatMessage, P2PChatRoom } from '../types'

// Central chat server URL — change this after deploying to Render.com etc.
const CHAT_SERVER_WS = 'ws://127.0.0.1:8000'
const CHAT_SERVER_HTTP = 'http://127.0.0.1:8000'

interface P2PChatState {
  connected: boolean
  connecting: boolean
  username: string
  rooms: P2PChatRoom[]
  activeRoomId: string
  messages: P2PChatMessage[]
  users: string[]
  ws: WebSocket | null
  _reconnectTimer: ReturnType<typeof setTimeout> | null
  _reconnectDelay: number

  // Actions
  setUsername: (name: string) => void
  connect: () => void
  disconnect: () => void
  switchRoom: (roomId: string) => void
  sendMessage: (content: string) => void
  requestRooms: () => void
  createRoom: (name: string) => void
}

export const useP2PChatStore = create<P2PChatState>((set, get) => ({
  connected: false,
  connecting: false,
  username: '',
  rooms: [],
  activeRoomId: 'general',
  messages: [],
  users: [],
  ws: null,
  _reconnectTimer: null,
  _reconnectDelay: 1000,

  setUsername: (name) => set({ username: name }),

  connect: () => {
    const { ws, connecting, activeRoomId, username } = get()
    if (ws || connecting || !username) return

    set({ connecting: true })

    const wsUrl = `${CHAT_SERVER_WS}/ws/${activeRoomId}`
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      // Send join message
      socket.send(JSON.stringify({ type: 'join', username }))
      set({ connected: true, connecting: false, ws: socket, _reconnectDelay: 1000 })
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const state = get()

        switch (data.type) {
          case 'joined':
            // Server assigned username (may differ if duplicate)
            set({ username: data.username })
            break

          case 'history':
            set({ messages: data.messages || [] })
            break

          case 'users':
            set({ users: data.users || [] })
            break

          case 'message':
            set({ messages: [...state.messages, data] })
            break

          case 'join':
            set({
              messages: [...state.messages, {
                id: `join-${Date.now()}`,
                username: data.username,
                content: '',
                timestamp: data.timestamp,
                type: 'join',
              }],
            })
            break

          case 'leave':
            set({
              messages: [...state.messages, {
                id: `leave-${Date.now()}`,
                username: data.username,
                content: '',
                timestamp: data.timestamp,
                type: 'leave',
              }],
            })
            break

          case 'rooms':
            set({ rooms: data.rooms || [] })
            break
        }
      } catch { /* ignore parse errors */ }
    }

    socket.onclose = () => {
      set({ connected: false, connecting: false, ws: null })
      // Auto-reconnect with exponential backoff
      const delay = get()._reconnectDelay
      const timer = setTimeout(() => {
        const s = get()
        if (!s.connected && !s.connecting && s.username) {
          set({ _reconnectDelay: Math.min(delay * 2, 30000) })
          s.connect()
        }
      }, delay)
      set({ _reconnectTimer: timer })
    }

    socket.onerror = () => {
      // onclose will fire after this
    }
  },

  disconnect: () => {
    const { ws, _reconnectTimer } = get()
    if (_reconnectTimer) clearTimeout(_reconnectTimer)
    if (ws) {
      ws.onclose = null // Prevent auto-reconnect
      ws.close()
    }
    set({
      connected: false,
      connecting: false,
      ws: null,
      messages: [],
      users: [],
      _reconnectTimer: null,
      _reconnectDelay: 1000,
    })
  },

  switchRoom: (roomId) => {
    const { disconnect, connect } = get()
    disconnect()
    set({ activeRoomId: roomId, messages: [], users: [] })
    // Small delay to let cleanup happen
    setTimeout(() => {
      get().connect()
    }, 100)
  },

  sendMessage: (content) => {
    const { ws, connected } = get()
    if (!ws || !connected || !content.trim()) return
    ws.send(JSON.stringify({ type: 'message', content: content.trim() }))
  },

  requestRooms: () => {
    const { ws, connected } = get()
    if (!ws || !connected) {
      // Fallback: HTTP request
      fetch(`${CHAT_SERVER_HTTP}/rooms`)
        .then((r) => r.json())
        .then((data) => set({ rooms: data.rooms || [] }))
        .catch(() => {})
      return
    }
    ws.send(JSON.stringify({ type: 'rooms' }))
  },

  createRoom: (name) => {
    const { ws, connected } = get()
    if (!ws || !connected || !name.trim()) return
    ws.send(JSON.stringify({ type: 'create_room', name: name.trim() }))
  },
}))
