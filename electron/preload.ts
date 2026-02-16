import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  isDev: () => ipcRenderer.invoke('is-dev'),
  setSelectedModel: (model: string) => ipcRenderer.invoke('set-selected-model', model),
  whatsapp: {
    connect: (waVersion?: string) => ipcRenderer.invoke('whatsapp:connect', waVersion),
    disconnect: () => ipcRenderer.invoke('whatsapp:disconnect'),
    getStatus: () => ipcRenderer.invoke('whatsapp:status'),
    onQR: (cb: (dataUrl: string) => void) => {
      ipcRenderer.on('whatsapp:qr', (_event, qr) => cb(qr))
    },
    onStatusUpdate: (cb: (status: string) => void) => {
      ipcRenderer.on('whatsapp:status-update', (_event, s) => cb(s))
    },
    onChatMessage: (cb: (msg: { role: string; content: string; source: string }) => void) => {
      ipcRenderer.on('whatsapp:chat-message', (_event, msg) => cb(msg))
    },
    onTyping: (cb: (typing: boolean) => void) => {
      ipcRenderer.on('whatsapp:chat-typing', (_event, typing) => cb(typing))
    },
    removeSettingsListeners: () => {
      ipcRenderer.removeAllListeners('whatsapp:qr')
      ipcRenderer.removeAllListeners('whatsapp:status-update')
    },
    removeChatListeners: () => {
      ipcRenderer.removeAllListeners('whatsapp:chat-message')
      ipcRenderer.removeAllListeners('whatsapp:chat-typing')
    },
  },
  telegram: {
    connect: (apiId: string, apiHash: string) => ipcRenderer.invoke('telegram:connect', apiId, apiHash),
    disconnect: () => ipcRenderer.invoke('telegram:disconnect'),
    getStatus: () => ipcRenderer.invoke('telegram:status'),
    onQR: (cb: (dataUrl: string) => void) => {
      ipcRenderer.on('telegram:qr', (_event, qr) => cb(qr))
    },
    onStatusUpdate: (cb: (status: string) => void) => {
      ipcRenderer.on('telegram:status-update', (_event, s) => cb(s))
    },
    onChatMessage: (cb: (msg: { role: string; content: string; source: string }) => void) => {
      ipcRenderer.on('telegram:chat-message', (_event, msg) => cb(msg))
    },
    onTyping: (cb: (typing: boolean) => void) => {
      ipcRenderer.on('telegram:chat-typing', (_event, typing) => cb(typing))
    },
    removeSettingsListeners: () => {
      ipcRenderer.removeAllListeners('telegram:qr')
      ipcRenderer.removeAllListeners('telegram:status-update')
    },
    removeChatListeners: () => {
      ipcRenderer.removeAllListeners('telegram:chat-message')
      ipcRenderer.removeAllListeners('telegram:chat-typing')
    },
  },
  patch: {
    check: () => ipcRenderer.invoke('patch:check'),
    apply: () => ipcRenderer.invoke('patch:apply'),
    dismiss: (version: string) => ipcRenderer.invoke('patch:dismiss', version),
    restart: () => ipcRenderer.invoke('patch:restart'),
    onAvailable: (cb: (info: { version: string; notes: string }) => void) => {
      ipcRenderer.on('patch:available', (_event, info) => cb(info))
    },
    onProgress: (cb: (percent: number) => void) => {
      ipcRenderer.on('patch:progress', (_event, percent) => cb(percent))
    },
    onApplied: (cb: () => void) => {
      ipcRenderer.on('patch:applied', () => cb())
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('patch:available')
      ipcRenderer.removeAllListeners('patch:progress')
      ipcRenderer.removeAllListeners('patch:applied')
    },
  },
  matrix: {
    connect: (homeserverUrl: string, userId: string, password: string, accessToken: string) =>
      ipcRenderer.invoke('matrix:connect', homeserverUrl, userId, password, accessToken),
    disconnect: () => ipcRenderer.invoke('matrix:disconnect'),
    getStatus: () => ipcRenderer.invoke('matrix:status'),
    onQR: () => { /* Matrix uses password login, no QR */ },
    onStatusUpdate: (cb: (status: string) => void) => {
      ipcRenderer.on('matrix:status-update', (_event, s) => cb(s))
    },
    onChatMessage: (cb: (msg: { role: string; content: string; source: string }) => void) => {
      ipcRenderer.on('matrix:chat-message', (_event, msg) => cb(msg))
    },
    onTyping: (cb: (typing: boolean) => void) => {
      ipcRenderer.on('matrix:chat-typing', (_event, typing) => cb(typing))
    },
    removeSettingsListeners: () => {
      ipcRenderer.removeAllListeners('matrix:status-update')
    },
    removeChatListeners: () => {
      ipcRenderer.removeAllListeners('matrix:chat-message')
      ipcRenderer.removeAllListeners('matrix:chat-typing')
    },
  },
  googleAuth: {
    login: () => ipcRenderer.invoke('google-auth:login'),
    getStatus: () => ipcRenderer.invoke('google-auth:status'),
    logout: () => ipcRenderer.invoke('google-auth:logout'),
  },
  tunnel: {
    start: () => ipcRenderer.invoke('tunnel:start'),
    stop: () => ipcRenderer.invoke('tunnel:stop'),
    getStatus: () => ipcRenderer.invoke('tunnel:status'),
  },
})
