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
  onStatusUpdate: (cb: (status: string, error?: string) => void) => void
}

interface ElectronTelegramAPI extends ElectronChatAppAPI {
  connect: (apiId: string, apiHash: string) => Promise<void>
}

interface ElectronMatrixAPI extends ElectronChatAppAPI {
  connect: (homeserverUrl: string, userId: string, password: string, accessToken: string) => Promise<void>
}

interface ElectronSlackAPI extends ElectronChatAppAPI {
  connect: (botToken: string, appToken: string) => Promise<void>
}

interface ElectronDiscordAPI extends ElectronChatAppAPI {
  connect: (botToken: string) => Promise<void>
}

interface ElectronTunnelAPI {
  start: () => Promise<string | { url: string; error: string }>
  stop: () => Promise<void>
  getStatus: () => Promise<string>
}

interface ElectronGoogleAuthAPI {
  login: () => Promise<{ email: string; name: string; picture_url: string } | null>
  getStatus: () => Promise<{ logged_in: boolean; email?: string; name?: string; picture_url?: string }>
  logout: () => Promise<void>
}

interface ElectronOutlookAuthAPI {
  login: (clientId: string, clientSecret: string) => Promise<{ email: string; name: string } | null>
  getStatus: () => Promise<{ logged_in: boolean; email?: string; name?: string }>
  logout: () => Promise<void>
}

interface ElectronAPI {
  getAppPath: () => Promise<string>
  isDev: () => Promise<boolean>
  setSelectedModel: (model: string) => Promise<void>
  whatsapp: ElectronWhatsAppAPI
  telegram: ElectronTelegramAPI
  matrix: ElectronMatrixAPI
  slack: ElectronSlackAPI
  discord: ElectronDiscordAPI
  googleAuth: ElectronGoogleAuthAPI
  outlookAuth: ElectronOutlookAuthAPI
  tunnel: ElectronTunnelAPI
}

interface Window {
  electronAPI: ElectronAPI
}
