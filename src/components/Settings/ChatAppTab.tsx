import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Send, Globe, Hash, MessageSquare, Wifi, WifiOff, Loader2, QrCode, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'

type AppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'
type AppId = 'whatsapp' | 'telegram' | 'matrix' | 'slack' | 'discord'

const statusLabel: Record<AppStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  qr: 'Scan QR Code',
  connected: 'Connected',
}

const statusColor: Record<AppStatus, string> = {
  disconnected: 'text-slate-400',
  connecting: 'text-yellow-400',
  qr: 'text-yellow-400',
  connected: 'text-green-400',
}

interface AppDef {
  id: AppId
  name: string
  icon: typeof MessageCircle
  color: string
  activeColor: string
  bgColor: string
  borderColor: string
  ringColor: string
}

const APP_DEFS: AppDef[] = [
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', activeColor: 'bg-green-500/15', bgColor: 'bg-green-600/20', borderColor: 'border-green-600/30', ringColor: 'ring-green-500/40' },
  { id: 'telegram', name: 'Telegram', icon: Send, color: 'text-blue-400', activeColor: 'bg-blue-500/15', bgColor: 'bg-blue-600/20', borderColor: 'border-blue-600/30', ringColor: 'ring-blue-500/40' },
  { id: 'matrix', name: 'Matrix', icon: Globe, color: 'text-purple-400', activeColor: 'bg-purple-500/15', bgColor: 'bg-purple-600/20', borderColor: 'border-purple-600/30', ringColor: 'ring-purple-500/40' },
  { id: 'slack', name: 'Slack', icon: Hash, color: 'text-amber-400', activeColor: 'bg-amber-500/15', bgColor: 'bg-amber-600/20', borderColor: 'border-amber-600/30', ringColor: 'ring-amber-500/40' },
  { id: 'discord', name: 'Discord', icon: MessageSquare, color: 'text-indigo-400', activeColor: 'bg-indigo-500/15', bgColor: 'bg-indigo-600/20', borderColor: 'border-indigo-600/30', ringColor: 'ring-indigo-500/40' },
]

function StatusIcon({ status }: { status: AppStatus }) {
  if (status === 'connected') return <Wifi size={16} className="text-green-400" />
  if (status === 'connecting' || status === 'qr') return <Loader2 size={16} className="text-yellow-400 animate-spin" />
  return <WifiOff size={16} className="text-slate-400" />
}

function StatusDot({ status }: { status: AppStatus }) {
  if (status === 'connected') return <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
  if (status === 'connecting' || status === 'qr') return <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-yellow-500 rounded-full border-2 border-slate-900 animate-pulse" />
  return null
}

export default function ChatAppTab() {
  const { t } = useTranslation()
  const { config, updateWhatsAppConfig, updateTelegramConfig, updateMatrixConfig, updateSlackConfig, updateDiscordConfig, updateApiConfig } = useSettingsStore()

  const [selectedApp, setSelectedApp] = useState<AppId>('whatsapp')

  // ── WhatsApp state ──
  const [waStatus, setWaStatus] = useState<AppStatus>('disconnected')
  const [waQr, setWaQr] = useState<string | null>(null)
  const [waError, setWaError] = useState<string | null>(null)
  const waApi = window.electronAPI?.whatsapp

  useEffect(() => {
    if (!waApi) return
    waApi.getStatus().then((s) => setWaStatus(s as AppStatus))
    waApi.onQR((dataUrl) => setWaQr(dataUrl))
    waApi.onStatusUpdate((s, error) => {
      setWaStatus(s as AppStatus)
      if (s === 'connected') setWaQr(null)
      setWaError(error || null)
    })
    return () => { waApi.removeSettingsListeners() }
  }, [waApi])

  const handleWaConnect = useCallback(async () => {
    if (!waApi) return
    setWaQr(null)
    setWaError(null)
    try {
      await waApi.connect(config.whatsapp.wa_version)
    } catch (err: any) {
      setWaError(err?.message || 'Connection failed')
      setWaStatus('disconnected')
    }
  }, [waApi, config.whatsapp.wa_version])

  const handleWaDisconnect = useCallback(async () => {
    if (!waApi) return
    setWaQr(null)
    await waApi.disconnect()
  }, [waApi])

  // ── Telegram state ──
  const [tgStatus, setTgStatus] = useState<AppStatus>('disconnected')
  const [tgQr, setTgQr] = useState<string | null>(null)
  const [showApiHash, setShowApiHash] = useState(false)
  const [showMxPassword, setShowMxPassword] = useState(false)
  const [showMxToken, setShowMxToken] = useState(false)
  const tgApi = window.electronAPI?.telegram

  useEffect(() => {
    if (!tgApi) return
    tgApi.getStatus().then((s) => setTgStatus(s as AppStatus))
    tgApi.onQR((dataUrl) => setTgQr(dataUrl))
    tgApi.onStatusUpdate((s) => {
      setTgStatus(s as AppStatus)
      if (s === 'connected') setTgQr(null)
    })
    return () => { tgApi.removeSettingsListeners() }
  }, [tgApi])

  const handleTgConnect = useCallback(async () => {
    if (!tgApi) return
    if (!config.telegram.api_id || !config.telegram.api_hash) {
      alert('Telegram API ID and API Hash are required. Get them from https://my.telegram.org')
      return
    }
    setTgQr(null)
    await tgApi.connect(config.telegram.api_id, config.telegram.api_hash)
  }, [tgApi, config.telegram.api_id, config.telegram.api_hash])

  const handleTgDisconnect = useCallback(async () => {
    if (!tgApi) return
    setTgQr(null)
    await tgApi.disconnect()
  }, [tgApi])

  // ── Matrix state ──
  const [mxStatus, setMxStatus] = useState<AppStatus>('disconnected')
  const mxApi = window.electronAPI?.matrix

  useEffect(() => {
    if (!mxApi) return
    mxApi.getStatus().then((s) => setMxStatus(s as AppStatus))
    mxApi.onStatusUpdate((s) => setMxStatus(s as AppStatus))
    return () => { mxApi.removeSettingsListeners() }
  }, [mxApi])

  const handleMxConnect = useCallback(async () => {
    if (!mxApi) return
    if (!config.matrix.user_id) {
      alert('Matrix User ID is required (e.g., @username:matrix.org)')
      return
    }
    if (!config.matrix.password && !config.matrix.access_token) {
      alert('Password or Access Token is required')
      return
    }
    await mxApi.connect(config.matrix.homeserver_url, config.matrix.user_id, config.matrix.password, config.matrix.access_token)
  }, [mxApi, config.matrix])

  const handleMxDisconnect = useCallback(async () => {
    if (!mxApi) return
    await mxApi.disconnect()
  }, [mxApi])

  // ── Slack state ──
  const [slStatus, setSlStatus] = useState<AppStatus>('disconnected')
  const [showBotToken, setShowBotToken] = useState(false)
  const [showAppToken, setShowAppToken] = useState(false)
  const slApi = window.electronAPI?.slack

  useEffect(() => {
    if (!slApi) return
    slApi.getStatus().then((s) => setSlStatus(s as AppStatus))
    slApi.onStatusUpdate((s) => setSlStatus(s as AppStatus))
    return () => { slApi.removeSettingsListeners() }
  }, [slApi])

  const handleSlConnect = useCallback(async () => {
    if (!slApi) return
    if (!config.api.slack_bot_token || !config.api.slack_app_token) {
      alert('Slack Bot Token (xoxb-...) and App Token (xapp-...) are required')
      return
    }
    await slApi.connect(config.api.slack_bot_token, config.api.slack_app_token)
  }, [slApi, config.api.slack_bot_token, config.api.slack_app_token])

  const handleSlDisconnect = useCallback(async () => {
    if (!slApi) return
    await slApi.disconnect()
  }, [slApi])

  // ── Discord state ──
  const [dcStatus, setDcStatus] = useState<AppStatus>('disconnected')
  const [showDcBotToken, setShowDcBotToken] = useState(false)
  const dcApi = window.electronAPI?.discord

  useEffect(() => {
    if (!dcApi) return
    dcApi.getStatus().then((s) => setDcStatus(s as AppStatus))
    dcApi.onStatusUpdate((s) => setDcStatus(s as AppStatus))
    return () => { dcApi.removeSettingsListeners() }
  }, [dcApi])

  const handleDcConnect = useCallback(async () => {
    if (!dcApi) return
    if (!config.discord.bot_token) {
      alert('Discord Bot Token is required. Get it from https://discord.com/developers/applications')
      return
    }
    await dcApi.connect(config.discord.bot_token)
  }, [dcApi, config.discord.bot_token])

  const handleDcDisconnect = useCallback(async () => {
    if (!dcApi) return
    await dcApi.disconnect()
  }, [dcApi])

  // ── Status map ──
  const statusMap: Record<AppId, AppStatus> = {
    whatsapp: waStatus,
    telegram: tgStatus,
    matrix: mxStatus,
    slack: slStatus,
    discord: dcStatus,
  }

  const enabledMap: Record<AppId, boolean> = {
    whatsapp: config.whatsapp.enabled,
    telegram: config.telegram.enabled,
    matrix: config.matrix.enabled,
    slack: config.slack.enabled,
    discord: config.discord.enabled,
  }

  const selectedDef = APP_DEFS.find(a => a.id === selectedApp)!
  const currentStatus = statusMap[selectedApp]

  return (
    <div className="flex gap-5 min-h-[480px]">
      {/* ── Left: App Icon List ── */}
      <div className="flex flex-col gap-3 pt-1">
        {APP_DEFS.map((app) => {
          const Icon = app.icon
          const isSelected = selectedApp === app.id
          const status = statusMap[app.id]
          const enabled = enabledMap[app.id]

          return (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app.id)}
              className={`relative w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isSelected
                  ? `${app.activeColor} ring-2 ${app.ringColor} shadow-lg`
                  : 'bg-slate-800/60 hover:bg-slate-700/60'
              } ${!enabled ? 'opacity-40' : ''}`}
              title={`${app.name}${status === 'connected' ? ' (Connected)' : ''}`}
            >
              <Icon size={24} className={isSelected ? app.color : 'text-slate-400'} />
              {enabled && <StatusDot status={status} />}
            </button>
          )
        })}
      </div>

      {/* ── Right: Selected App Detail Panel ── */}
      <div className="flex-1 border border-slate-700 rounded-xl overflow-hidden bg-slate-800/30">
        {/* Panel Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 ${selectedDef.activeColor} border-b border-slate-700/50`}>
          <div className="flex items-center gap-3">
            <selectedDef.icon size={22} className={selectedDef.color} />
            <h3 className="text-base font-semibold text-slate-200">{selectedDef.name}</h3>
            <div className="flex items-center gap-1.5 ml-2">
              <StatusIcon status={currentStatus} />
              <span className={`text-xs font-medium ${statusColor[currentStatus]}`}>{statusLabel[currentStatus]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`${selectedApp}-enabled`}
              checked={enabledMap[selectedApp]}
              onChange={(e) => {
                if (selectedApp === 'whatsapp') updateWhatsAppConfig({ enabled: e.target.checked })
                else if (selectedApp === 'telegram') updateTelegramConfig({ enabled: e.target.checked })
                else if (selectedApp === 'matrix') updateMatrixConfig({ enabled: e.target.checked })
                else if (selectedApp === 'slack') updateSlackConfig({ enabled: e.target.checked })
                else if (selectedApp === 'discord') updateDiscordConfig({ enabled: e.target.checked })
              }}
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500" />
            <label htmlFor={`${selectedApp}-enabled`} className="text-sm text-slate-300">Enabled</label>
          </div>
        </div>

        {/* Panel Content */}
        <div className="px-5 py-5 overflow-y-auto max-h-[calc(100vh-320px)]">
          {!enabledMap[selectedApp] ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <selectedDef.icon size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-400 text-sm">Enable {selectedDef.name} to configure and connect.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ── WhatsApp Panel ── */}
              {selectedApp === 'whatsapp' && (
                <>
                  {/* QR / Connection area */}
                  <div className="flex flex-col items-center">
                    {(waStatus === 'qr' || waStatus === 'connecting') && waQr ? (
                      <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-xl w-full max-w-[280px]">
                        <img src={waQr} alt="WhatsApp QR Code" className="w-56 h-56" />
                        <p className="text-xs text-gray-600 text-center px-4">
                          Open WhatsApp on your phone &gt; Linked Devices &gt; Scan this QR code
                        </p>
                      </div>
                    ) : waStatus === 'connecting' && !waQr ? (
                      <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 size={56} className="text-slate-600 animate-spin" />
                        <p className="text-sm text-slate-400">Waiting for QR code...</p>
                      </div>
                    ) : waStatus === 'connected' ? (
                      <div className="flex flex-col items-center gap-2 py-6">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Wifi size={28} className="text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-green-400">WhatsApp Connected</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className={`w-16 h-16 rounded-full ${waError ? 'bg-red-500/10' : 'bg-slate-700/50'} flex items-center justify-center`}>
                          <QrCode size={28} className={waError ? 'text-red-400' : 'text-slate-500'} />
                        </div>
                        <p className="text-sm text-slate-400">{waError ? 'Connection failed. Click Connect to retry.' : 'Click Connect to scan QR code'}</p>
                      </div>
                    )}

                    {/* Connect / Disconnect */}
                    <div className="mt-3">
                      {waStatus === 'connected' ? (
                        <button onClick={handleWaDisconnect}
                          className="px-5 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                          Disconnect
                        </button>
                      ) : waStatus === 'disconnected' ? (
                        <button onClick={handleWaConnect}
                          className={`px-5 py-2 text-sm ${selectedDef.bgColor} ${selectedDef.color} border ${selectedDef.borderColor} rounded-lg hover:brightness-125 transition-all`}>
                          Connect
                        </button>
                      ) : null}
                    </div>

                    {/* Error display */}
                    {waError && (
                      <div className="mt-3 w-full max-w-[360px] px-4 py-2.5 bg-red-600/10 border border-red-600/20 rounded-lg">
                        <p className="text-xs text-red-400 break-words">{waError}</p>
                      </div>
                    )}
                  </div>

                  <hr className="border-slate-700/50" />

                  {/* Settings */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">WhatsApp Web Version</label>
                      <input type="text" value={config.whatsapp.wa_version}
                        onChange={(e) => updateWhatsAppConfig({ wa_version: e.target.value })}
                        placeholder="2,3000,1027934701"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                      <p className="text-xs text-slate-500 mt-1">Protocol version (comma-separated). Change if connection fails with 405 error.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Model (optional)</label>
                      <input type="text" value={config.whatsapp.default_model}
                        onChange={(e) => updateWhatsAppConfig({ default_model: e.target.value })}
                        placeholder="Leave empty to use global default model"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                    </div>
                  </div>
                </>
              )}

              {/* ── Telegram Panel ── */}
              {selectedApp === 'telegram' && (
                <>
                  {/* Credential Inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">API ID</label>
                      <input type="text" value={config.telegram.api_id}
                        onChange={(e) => updateTelegramConfig({ api_id: e.target.value })}
                        placeholder="12345678"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">API Hash</label>
                      <div className="flex gap-2">
                        <input type={showApiHash ? 'text' : 'password'} value={config.telegram.api_hash}
                          onChange={(e) => updateTelegramConfig({ api_hash: e.target.value })}
                          placeholder="abcdef1234567890abcdef1234567890"
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                        <button onClick={() => setShowApiHash(!showApiHash)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showApiHash ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Get API credentials from <span className="text-blue-400">https://my.telegram.org</span> (free, instant)
                      </p>
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  {/* QR / Connection area */}
                  <div className="flex flex-col items-center">
                    {(tgStatus === 'qr' || tgStatus === 'connecting') && tgQr ? (
                      <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-xl w-full max-w-[280px]">
                        <img src={tgQr} alt="Telegram QR Code" className="w-56 h-56" />
                        <p className="text-xs text-gray-600 text-center px-4">
                          Open Telegram on your phone &gt; Settings &gt; Devices &gt; Link Desktop Device
                        </p>
                      </div>
                    ) : tgStatus === 'connecting' && !tgQr ? (
                      <div className="flex flex-col items-center gap-3 py-8">
                        <QrCode size={56} className="text-slate-600" />
                        <p className="text-sm text-slate-400">Waiting for QR code...</p>
                      </div>
                    ) : tgStatus === 'connected' ? (
                      <div className="flex flex-col items-center gap-2 py-6">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Wifi size={28} className="text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-green-400">Telegram Connected</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center">
                          <QrCode size={28} className="text-slate-500" />
                        </div>
                        <p className="text-sm text-slate-400">Enter credentials and click Connect</p>
                      </div>
                    )}

                    <div className="mt-3">
                      {tgStatus === 'connected' ? (
                        <button onClick={handleTgDisconnect}
                          className="px-5 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                          Disconnect
                        </button>
                      ) : tgStatus === 'disconnected' ? (
                        <button onClick={handleTgConnect}
                          className={`px-5 py-2 text-sm ${selectedDef.bgColor} ${selectedDef.color} border ${selectedDef.borderColor} rounded-lg hover:brightness-125 transition-all`}>
                          Connect
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Model (optional)</label>
                    <input type="text" value={config.telegram.default_model}
                      onChange={(e) => updateTelegramConfig({ default_model: e.target.value })}
                      placeholder="Leave empty to use global default model"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                  </div>
                </>
              )}

              {/* ── Matrix Panel ── */}
              {selectedApp === 'matrix' && (
                <>
                  {/* Credential Inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Homeserver URL</label>
                      <input type="text" value={config.matrix.homeserver_url}
                        onChange={(e) => updateMatrixConfig({ homeserver_url: e.target.value })}
                        placeholder="https://matrix.org"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">User ID</label>
                      <input type="text" value={config.matrix.user_id}
                        onChange={(e) => updateMatrixConfig({ user_id: e.target.value })}
                        placeholder="@username:matrix.org"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                      <div className="flex gap-2">
                        <input type={showMxPassword ? 'text' : 'password'} value={config.matrix.password}
                          onChange={(e) => updateMatrixConfig({ password: e.target.value })}
                          placeholder="Matrix account password"
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                        <button onClick={() => setShowMxPassword(!showMxPassword)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showMxPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{t('settings.matrixPasswordHelp')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Access Token</label>
                      <div className="flex gap-2">
                        <input type={showMxToken ? 'text' : 'password'} value={config.matrix.access_token}
                          onChange={(e) => updateMatrixConfig({ access_token: e.target.value })}
                          placeholder="syt_..."
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                        <button onClick={() => setShowMxToken(!showMxToken)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showMxToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{t('settings.matrixTokenHelp')}</p>
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  {/* Connection area */}
                  <div className="flex flex-col items-center">
                    {mxStatus === 'connected' ? (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Wifi size={28} className="text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-green-400">Matrix Connected</p>
                      </div>
                    ) : mxStatus === 'connecting' ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <Loader2 size={36} className="text-purple-400 animate-spin" />
                        <p className="text-sm text-slate-400">Connecting to Matrix...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center">
                          <Globe size={28} className="text-slate-500" />
                        </div>
                        <p className="text-sm text-slate-400">Fill in credentials and click Connect</p>
                      </div>
                    )}

                    <div className="mt-2">
                      {mxStatus === 'connected' ? (
                        <button onClick={handleMxDisconnect}
                          className="px-5 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                          Disconnect
                        </button>
                      ) : mxStatus === 'disconnected' ? (
                        <button onClick={handleMxConnect}
                          className={`px-5 py-2 text-sm ${selectedDef.bgColor} ${selectedDef.color} border ${selectedDef.borderColor} rounded-lg hover:brightness-125 transition-all`}>
                          Connect
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Model (optional)</label>
                    <input type="text" value={config.matrix.default_model}
                      onChange={(e) => updateMatrixConfig({ default_model: e.target.value })}
                      placeholder="Leave empty to use global default model"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                  </div>
                </>
              )}

              {/* ── Slack Panel ── */}
              {selectedApp === 'slack' && (
                <>
                  {/* Token Inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Bot Token</label>
                      <div className="flex gap-2">
                        <input type={showBotToken ? 'text' : 'password'}
                          value={config.api.slack_bot_token}
                          onChange={(e) => updateApiConfig({ slack_bot_token: e.target.value })}
                          placeholder="xoxb-..."
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                        <button onClick={() => setShowBotToken(!showBotToken)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showBotToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">App-Level Token (Socket Mode)</label>
                      <div className="flex gap-2">
                        <input type={showAppToken ? 'text' : 'password'}
                          value={config.api.slack_app_token}
                          onChange={(e) => updateApiConfig({ slack_app_token: e.target.value })}
                          placeholder="xapp-..."
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                        <button onClick={() => setShowAppToken(!showAppToken)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showAppToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{t('settings.slackTokenHelp')}</p>
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  {/* Connection area */}
                  <div className="flex flex-col items-center">
                    {slStatus === 'connected' ? (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Wifi size={28} className="text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-green-400">Slack Connected</p>
                      </div>
                    ) : slStatus === 'connecting' ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <Loader2 size={36} className="text-amber-400 animate-spin" />
                        <p className="text-sm text-slate-400">Connecting to Slack...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center">
                          <Hash size={28} className="text-slate-500" />
                        </div>
                        <p className="text-sm text-slate-400">Enter tokens and click Connect</p>
                      </div>
                    )}

                    <div className="mt-2">
                      {slStatus === 'connected' ? (
                        <button onClick={handleSlDisconnect}
                          className="px-5 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                          Disconnect
                        </button>
                      ) : slStatus === 'disconnected' ? (
                        <button onClick={handleSlConnect}
                          className={`px-5 py-2 text-sm ${selectedDef.bgColor} ${selectedDef.color} border ${selectedDef.borderColor} rounded-lg hover:brightness-125 transition-all`}>
                          Connect
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Model (optional)</label>
                    <input type="text" value={config.slack.default_model}
                      onChange={(e) => updateSlackConfig({ default_model: e.target.value })}
                      placeholder="Leave empty to use global default model"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                  </div>
                </>
              )}

              {/* ── Discord Panel ── */}
              {selectedApp === 'discord' && (
                <>
                  {/* Token Input */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Bot Token</label>
                      <div className="flex gap-2">
                        <input type={showDcBotToken ? 'text' : 'password'}
                          value={config.discord.bot_token}
                          onChange={(e) => updateDiscordConfig({ bot_token: e.target.value })}
                          placeholder="MTIz..."
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                        <button onClick={() => setShowDcBotToken(!showDcBotToken)}
                          className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                          {showDcBotToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {t('settings.discordTokenHelp')}
                      </p>
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  {/* Connection area */}
                  <div className="flex flex-col items-center">
                    {dcStatus === 'connected' ? (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Wifi size={28} className="text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-green-400">Discord Connected</p>
                      </div>
                    ) : dcStatus === 'connecting' ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <Loader2 size={36} className="text-indigo-400 animate-spin" />
                        <p className="text-sm text-slate-400">Connecting to Discord...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center">
                          <MessageSquare size={28} className="text-slate-500" />
                        </div>
                        <p className="text-sm text-slate-400">Enter bot token and click Connect</p>
                      </div>
                    )}

                    <div className="mt-2">
                      {dcStatus === 'connected' ? (
                        <button onClick={handleDcDisconnect}
                          className="px-5 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                          Disconnect
                        </button>
                      ) : dcStatus === 'disconnected' ? (
                        <button onClick={handleDcConnect}
                          className={`px-5 py-2 text-sm ${selectedDef.bgColor} ${selectedDef.color} border ${selectedDef.borderColor} rounded-lg hover:brightness-125 transition-all`}>
                          Connect
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <hr className="border-slate-700/50" />

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Model (optional)</label>
                    <input type="text" value={config.discord.default_model}
                      onChange={(e) => updateDiscordConfig({ default_model: e.target.value })}
                      placeholder="Leave empty to use global default model"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
