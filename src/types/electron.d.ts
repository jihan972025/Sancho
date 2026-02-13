interface ElectronChatAppAPI {
  connect: (...args: any[]) => Promise<void>
  disconnect: () => Promise<void>
  getStatus: () => Promise<string>
  onQR: (cb: (dataUrl: string) => void) => void
  onStatusUpdate: (cb: (status: string) => void) => void
  onChatMessage: (cb: (msg: { role: string; content: string; source: string }) => void) => void
  onTyping: (cb: (typing: boolean) => void) => void
  removeSettingsListeners: () => void
  removeChatListeners: () => void
}

interface ElectronWhatsAppAPI extends ElectronChatAppAPI {
  connect: (waVersion?: string) => Promise<void>
}

interface ElectronTelegramAPI extends ElectronChatAppAPI {
  connect: (apiId: string, apiHash: string) => Promise<void>
}

interface ElectronMatrixAPI extends ElectronChatAppAPI {
  connect: (homeserverUrl: string, userId: string, password: string, accessToken: string) => Promise<void>
}

interface ElectronGoogleAuthAPI {
  login: () => Promise<{ email: string; name: string; picture_url: string } | null>
  getStatus: () => Promise<{ logged_in: boolean; email?: string; name?: string; picture_url?: string }>
  logout: () => Promise<void>
}

interface ElectronAPI {
  getAppPath: () => Promise<string>
  isDev: () => Promise<boolean>
  setSelectedModel: (model: string) => Promise<void>
  whatsapp: ElectronWhatsAppAPI
  telegram: ElectronTelegramAPI
  matrix: ElectronMatrixAPI
  googleAuth: ElectronGoogleAuthAPI
}

interface Window {
  electronAPI: ElectronAPI
}
