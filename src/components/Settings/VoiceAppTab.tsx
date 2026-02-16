import { useState, useEffect } from 'react'
import { Mic, Copy, CheckCircle, RefreshCw, Wifi, Smartphone, Globe, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'

const BASE_URL = 'http://127.0.0.1:8765'

export default function VoiceAppTab() {
  const { t } = useTranslation()
  const [voiceUrl, setVoiceUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isTunnel, setIsTunnel] = useState(false)
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [tunnelError, setTunnelError] = useState('')

  const fetchVoiceInfo = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE_URL}/api/voice/info`)
      if (res.ok) {
        const data = await res.json()
        const url = data.url || ''
        setVoiceUrl(url)
        setIsTunnel(!!data.tunnel)
        if (url) {
          const dataUrl = await QRCode.toDataURL(url, {
            width: 280,
            margin: 2,
            color: { dark: '#0f172a', light: '#ffffff' },
          })
          setQrDataUrl(dataUrl)
        }
      } else {
        setError('Failed to get voice app info')
      }
    } catch {
      setError('Backend not reachable')
    } finally {
      setLoading(false)
    }
  }

  // Check tunnel status on mount.
  // Run sequentially: fetchVoiceInfo first, then IPC check last.
  // IPC (Electron main process) is the source of truth — it overrides
  // the backend response in case of any inconsistency.
  useEffect(() => {
    const initStatus = async () => {
      await fetchVoiceInfo()
      if (window.electronAPI?.tunnel) {
        try {
          const url = await window.electronAPI.tunnel.getStatus()
          if (url) setIsTunnel(true)
        } catch (err) {
          console.error('[VoiceApp] Tunnel status check error:', err)
        }
      }
    }
    initStatus()
  }, [])

  const handleToggleTunnel = async () => {
    setTunnelError('')

    // Safety check: Electron API availability
    if (!window.electronAPI?.tunnel) {
      setTunnelError('Tunnel API not available (not running in Electron)')
      return
    }

    if (isTunnel) {
      // Stop tunnel
      try {
        await window.electronAPI.tunnel.stop()
        setIsTunnel(false)
        await fetchVoiceInfo()
      } catch (err) {
        console.error('[VoiceApp] Tunnel stop error:', err)
        setTunnelError(t('voice.tunnelError'))
      }
    } else {
      // Start tunnel
      setTunnelLoading(true)
      try {
        const result = await window.electronAPI.tunnel.start()
        // Handle both old (string) and new ({url, error}) response formats
        const url = typeof result === 'string' ? result : result?.url || ''
        const error = typeof result === 'object' && result !== null ? result.error : ''

        if (url) {
          setIsTunnel(true)
          await fetchVoiceInfo()
        } else {
          console.error('[VoiceApp] Tunnel start failed:', error || 'no URL returned')
          setTunnelError(error || t('voice.tunnelError'))
        }
      } catch (err) {
        console.error('[VoiceApp] Tunnel start error:', err)
        setTunnelError(t('voice.tunnelError'))
      } finally {
        setTunnelLoading(false)
      }
    }
  }

  const handleCopy = async () => {
    if (!voiceUrl) return
    try {
      await navigator.clipboard.writeText(voiceUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = voiceUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Mic size={20} className="text-amber-400" />
          <h2 className="text-lg font-semibold text-slate-200">{t('voice.title')}</h2>
        </div>
        <p className="text-sm text-slate-400">{t('voice.description')}</p>
      </div>

      {/* Internet Access Toggle */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={18} className={isTunnel ? 'text-emerald-400' : 'text-slate-500'} />
            <div>
              <p className="text-sm font-medium text-slate-200">{t('voice.internetAccess')}</p>
              <p className="text-xs text-slate-500">{t('voice.internetDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleToggleTunnel}
            disabled={tunnelLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              isTunnel ? 'bg-emerald-600' : 'bg-slate-600'
            } ${tunnelLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isTunnel ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Tunnel status */}
        {tunnelLoading && (
          <div className="flex items-center gap-2 mt-3 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            <span>{t('voice.tunnelStarting')}</span>
            <span className="text-slate-500">({t('voice.tunnelFirstTime')})</span>
          </div>
        )}
        {tunnelError && (
          <p className="mt-3 text-xs text-red-400">{tunnelError}</p>
        )}
        {isTunnel && !tunnelLoading && (
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Globe size={10} />
              {t('voice.internet')}
            </span>
            <span className="text-xs text-emerald-400/70">{t('voice.tunnelActive')}</span>
          </div>
        )}
        {!isTunnel && !tunnelLoading && (
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Wifi size={10} />
              {t('voice.wifiOnly')}
            </span>
          </div>
        )}
      </div>

      {/* QR Code Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-300">{t('voice.qrCode')}</h3>
          <button
            onClick={fetchVoiceInfo}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* QR Code */}
            {qrDataUrl && (
              <div className="bg-white rounded-xl p-3">
                <img src={qrDataUrl} alt="Voice App QR" className="w-56 h-56" />
              </div>
            )}

            {/* Scan Guide */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Smartphone size={14} />
              <span>{isTunnel ? t('voice.scanGuideInternet') : t('voice.scanGuide')}</span>
            </div>

            {/* URL Display + Copy */}
            <div className="w-full">
              <label className="block text-xs text-slate-500 mb-1">{t('voice.voiceUrl')}</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 truncate select-all">
                  {voiceUrl}
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm transition-colors flex-shrink-0"
                >
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  {copied ? t('voice.copied') : t('voice.copyUrl')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Network Info */}
      <div className={`flex items-start gap-3 p-4 border rounded-xl ${
        isTunnel
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        {isTunnel ? (
          <Globe size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        ) : (
          <Wifi size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        )}
        <p className={`text-sm ${isTunnel ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
          {isTunnel ? t('voice.tunnelActive') : t('voice.networkWarning')}
        </p>
      </div>
    </div>
  )
}
