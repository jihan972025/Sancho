import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Send, Globe, Hash, Wifi, WifiOff, Loader2, QrCode, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'

type AppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

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

function StatusIcon({ status }: { status: AppStatus }) {
  if (status === 'connected') return <Wifi size={16} className="text-green-400" />
  if (status === 'connecting' || status === 'qr') return <Loader2 size={16} className="text-yellow-400 animate-spin" />
  return <WifiOff size={16} className="text-slate-400" />
}

export default function ChatAppTab() {
  const { t } = useTranslation()
  const { config, updateWhatsAppConfig, updateTelegramConfig, updateMatrixConfig, updateSlackConfig, updateApiConfig } = useSettingsStore()

  // ── WhatsApp state ──
  const [waStatus, setWaStatus] = useState<AppStatus>('disconnected')
  const [waQr, setWaQr] = useState<string | null>(null)
  const waApi = window.electronAPI?.whatsapp

  useEffect(() => {
    if (!waApi) return
    waApi.getStatus().then((s) => setWaStatus(s as AppStatus))
    waApi.onQR((dataUrl) => setWaQr(dataUrl))
    waApi.onStatusUpdate((s) => {
      setWaStatus(s as AppStatus)
      if (s === 'connected') setWaQr(null)
    })
    return () => { waApi.removeSettingsListeners() }
  }, [waApi])

  const handleWaConnect = useCallback(async () => {
    if (!waApi) return
    setWaQr(null)
    await waApi.connect(config.whatsapp.wa_version)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Chat App Integrations</h2>
        <p className="text-sm text-slate-400">
          Connect messaging apps to receive and respond via Sancho AI.
        </p>
      </div>

      {/* ── WhatsApp Card ── */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-green-400" />
            <h3 className="font-medium text-slate-200">WhatsApp</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="wa-enabled" checked={config.whatsapp.enabled}
              onChange={(e) => updateWhatsAppConfig({ enabled: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500" />
            <label htmlFor="wa-enabled" className="text-sm text-slate-300">Enabled</label>
          </div>
        </div>

        {config.whatsapp.enabled && (
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status={waStatus} />
                <span className={`text-sm font-medium ${statusColor[waStatus]}`}>{statusLabel[waStatus]}</span>
              </div>
              {waStatus === 'connected' ? (
                <button onClick={handleWaDisconnect} className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">Disconnect</button>
              ) : waStatus === 'disconnected' ? (
                <button onClick={handleWaConnect} className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition-colors">Connect</button>
              ) : null}
            </div>

            {(waStatus === 'qr' || waStatus === 'connecting') && waQr && (
              <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg mx-auto max-w-[280px]">
                <img src={waQr} alt="WhatsApp QR Code" className="w-56 h-56" />
                <p className="text-xs text-gray-600 text-center px-4">
                  Open WhatsApp on your phone &gt; Linked Devices &gt; Scan this QR code
                </p>
              </div>
            )}

            {waStatus === 'connecting' && !waQr && (
              <div className="flex flex-col items-center gap-2 py-6">
                <QrCode size={48} className="text-slate-600" />
                <p className="text-sm text-slate-400">Waiting for QR code...</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">WhatsApp Web Version</label>
              <input type="text" value={config.whatsapp.wa_version}
                onChange={(e) => updateWhatsAppConfig({ wa_version: e.target.value })}
                placeholder="2,3000,1027934701"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
              <p className="text-xs text-slate-500 mt-1">Protocol version (comma-separated). Change if connection fails with 405 error.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default Model (optional)</label>
              <input type="text" value={config.whatsapp.default_model}
                onChange={(e) => updateWhatsAppConfig({ default_model: e.target.value })}
                placeholder="Leave empty to use global default model"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
            </div>
          </div>
        )}
      </div>

      {/* ── Telegram Card ── */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-blue-400" />
            <h3 className="font-medium text-slate-200">Telegram</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tg-enabled" checked={config.telegram.enabled}
              onChange={(e) => updateTelegramConfig({ enabled: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500" />
            <label htmlFor="tg-enabled" className="text-sm text-slate-300">Enabled</label>
          </div>
        </div>

        {config.telegram.enabled && (
          <div className="px-4 py-4 space-y-4">
            {/* API credentials */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">API ID</label>
              <input type="text" value={config.telegram.api_id}
                onChange={(e) => updateTelegramConfig({ api_id: e.target.value })}
                placeholder="12345678"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">API Hash</label>
              <div className="flex gap-2">
                <input type={showApiHash ? 'text' : 'password'} value={config.telegram.api_hash}
                  onChange={(e) => updateTelegramConfig({ api_hash: e.target.value })}
                  placeholder="abcdef1234567890abcdef1234567890"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                <button onClick={() => setShowApiHash(!showApiHash)}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white">
                  {showApiHash ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Get API credentials from <span className="text-blue-400">https://my.telegram.org</span> (free, instant)
              </p>
            </div>

            {/* Connection status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status={tgStatus} />
                <span className={`text-sm font-medium ${statusColor[tgStatus]}`}>{statusLabel[tgStatus]}</span>
              </div>
              {tgStatus === 'connected' ? (
                <button onClick={handleTgDisconnect} className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">Disconnect</button>
              ) : tgStatus === 'disconnected' ? (
                <button onClick={handleTgConnect} className="px-3 py-1.5 text-sm bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors">Connect</button>
              ) : null}
            </div>

            {/* QR Code display */}
            {(tgStatus === 'qr' || tgStatus === 'connecting') && tgQr && (
              <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg mx-auto max-w-[280px]">
                <img src={tgQr} alt="Telegram QR Code" className="w-56 h-56" />
                <p className="text-xs text-gray-600 text-center px-4">
                  Open Telegram on your phone &gt; Settings &gt; Devices &gt; Link Desktop Device
                </p>
              </div>
            )}

            {tgStatus === 'connecting' && !tgQr && (
              <div className="flex flex-col items-center gap-2 py-6">
                <QrCode size={48} className="text-slate-600" />
                <p className="text-sm text-slate-400">Waiting for QR code...</p>
              </div>
            )}

            {/* Default model */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default Model (optional)</label>
              <input type="text" value={config.telegram.default_model}
                onChange={(e) => updateTelegramConfig({ default_model: e.target.value })}
                placeholder="Leave empty to use global default model"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
            </div>
          </div>
        )}
      </div>

      {/* ── Matrix / Element Card ── */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-purple-400" />
            <h3 className="font-medium text-slate-200">Matrix / Element</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="mx-enabled" checked={config.matrix.enabled}
              onChange={(e) => updateMatrixConfig({ enabled: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500" />
            <label htmlFor="mx-enabled" className="text-sm text-slate-300">Enabled</label>
          </div>
        </div>

        {config.matrix.enabled && (
          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Homeserver URL</label>
              <input type="text" value={config.matrix.homeserver_url}
                onChange={(e) => updateMatrixConfig({ homeserver_url: e.target.value })}
                placeholder="https://matrix.org"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">User ID</label>
              <input type="text" value={config.matrix.user_id}
                onChange={(e) => updateMatrixConfig({ user_id: e.target.value })}
                placeholder="@username:matrix.org"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <div className="flex gap-2">
                <input type={showMxPassword ? 'text' : 'password'} value={config.matrix.password}
                  onChange={(e) => updateMatrixConfig({ password: e.target.value })}
                  placeholder="Matrix account password"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
                <button onClick={() => setShowMxPassword(!showMxPassword)}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white">
                  {showMxPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t('settings.matrixPasswordHelp')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Access Token</label>
              <div className="flex gap-2">
                <input type={showMxToken ? 'text' : 'password'} value={config.matrix.access_token}
                  onChange={(e) => updateMatrixConfig({ access_token: e.target.value })}
                  placeholder="syt_..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                <button onClick={() => setShowMxToken(!showMxToken)}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white">
                  {showMxToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t('settings.matrixTokenHelp')}
              </p>
            </div>

            {/* Connection status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status={mxStatus} />
                <span className={`text-sm font-medium ${statusColor[mxStatus]}`}>{statusLabel[mxStatus]}</span>
              </div>
              {mxStatus === 'connected' ? (
                <button onClick={handleMxDisconnect} className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">Disconnect</button>
              ) : mxStatus === 'disconnected' ? (
                <button onClick={handleMxConnect} className="px-3 py-1.5 text-sm bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded-lg hover:bg-purple-600/30 transition-colors">Connect</button>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default Model (optional)</label>
              <input type="text" value={config.matrix.default_model}
                onChange={(e) => updateMatrixConfig({ default_model: e.target.value })}
                placeholder="Leave empty to use global default model"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
            </div>
          </div>
        )}
      </div>

      {/* ── Slack Card ── */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Hash size={18} className="text-amber-400" />
            <h3 className="font-medium text-slate-200">Slack</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="slack-enabled" checked={config.slack.enabled}
              onChange={(e) => updateSlackConfig({ enabled: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500" />
            <label htmlFor="slack-enabled" className="text-sm text-slate-300">Enabled</label>
          </div>
        </div>

        {config.slack.enabled && (
          <div className="px-4 py-4 space-y-4">
            {/* Bot Token */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Bot Token</label>
              <div className="flex gap-2">
                <input type={showBotToken ? 'text' : 'password'}
                  value={config.api.slack_bot_token}
                  onChange={(e) => updateApiConfig({ slack_bot_token: e.target.value })}
                  placeholder="xoxb-..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                <button onClick={() => setShowBotToken(!showBotToken)}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white">
                  {showBotToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* App Token */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">App-Level Token (Socket Mode)</label>
              <div className="flex gap-2">
                <input type={showAppToken ? 'text' : 'password'}
                  value={config.api.slack_app_token}
                  onChange={(e) => updateApiConfig({ slack_app_token: e.target.value })}
                  placeholder="xapp-..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono" />
                <button onClick={() => setShowAppToken(!showAppToken)}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white">
                  {showAppToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t('settings.slackTokenHelp')}
              </p>
            </div>

            {/* Connection status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status={slStatus} />
                <span className={`text-sm font-medium ${statusColor[slStatus]}`}>{statusLabel[slStatus]}</span>
              </div>
              {slStatus === 'connected' ? (
                <button onClick={handleSlDisconnect} className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">Disconnect</button>
              ) : slStatus === 'disconnected' ? (
                <button onClick={handleSlConnect} className="px-3 py-1.5 text-sm bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded-lg hover:bg-amber-600/30 transition-colors">Connect</button>
              ) : null}
            </div>

            {/* Default model */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Default Model (optional)</label>
              <input type="text" value={config.slack.default_model}
                onChange={(e) => updateSlackConfig({ default_model: e.target.value })}
                placeholder="Leave empty to use global default model"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600" />
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
