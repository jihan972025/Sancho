import { Fragment, useState, useEffect, useRef } from 'react'
import {
  Play,
  Square,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  Brain,
  HelpCircle,
  Wallet,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '../../stores/chatStore'

const BASE_URL = 'http://127.0.0.1:8765'

interface CoinDef {
  id: string
  name: string
  color: string
}

const COINS: CoinDef[] = [
  { id: 'BTC', name: 'Bitcoin', color: '#f7931a' },
  { id: 'ETH', name: 'Ethereum', color: '#627eea' },
  { id: 'XRP', name: 'Ripple', color: '#00aae4' },
  { id: 'SOL', name: 'Solana', color: '#9945ff' },
  { id: 'TRX', name: 'TRON', color: '#ef0027' },
  { id: 'ADA', name: 'Cardano', color: '#0033ad' },
  { id: 'XMR', name: 'Monero', color: '#ff6600' },
]

const TIMEFRAME_IDS = ['5m', '10m', '15m', '30m', '1h', '4h'] as const
const CANDLE_IDS = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '4h'] as const

interface TradeRecord {
  id: string
  coin: string
  timeframe: string
  candle_interval?: string
  entry_price: number
  exit_price: number
  amount_krw: number
  quantity: number
  pnl_krw: number
  pnl_pct: number
  fee_krw: number
  reasoning: string
  entry_time: string
  exit_time: string
}

interface TradingStatus {
  running: boolean
  coin: string
  timeframe: string
  candle_interval?: string
  amount_krw: number
  model: string
  current_price: number
  in_position: boolean
  entry_price: number | null
  unrealized_pct: number
  unrealized_krw: number
  today_trades: number
  today_pnl_krw: number
  today_fees_krw: number
  last_signal: {
    action: string
    confidence: number
    reasoning: string
    expected_move_pct?: number
    stop_loss_pct?: number
    take_profit_pct?: number
  }
}

/** Format number with comma separators */
function formatComma(n: number): string {
  return n.toLocaleString('en-US')
}

/** Parse comma-formatted string to number */
function parseComma(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

/** Today as YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Yesterday as YYYY-MM-DD */
function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function AutoTradingPanel() {
  const { t, i18n } = useTranslation()
  const [coin, setCoin] = useState('BTC')
  const [timeframe, setTimeframe] = useState('5m')
  const [candleInterval, setCandleInterval] = useState('30m')
  const [amountKrw, setAmountKrw] = useState(10000)
  const [amountDisplay, setAmountDisplay] = useState('10,000')
  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<TradingStatus | null>(null)
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState(yesterdayStr)
  const [filterTo, setFilterTo] = useState(todayStr)

  const [strategy, setStrategy] = useState<'llm' | 'rule'>('llm')
  const [showStrategyHelp, setShowStrategyHelp] = useState(false)

  // Assets state
  interface CoinHolding {
    currency: string
    balance: number
    avg_buy_price: number
    current_price: number
    eval_krw: number
    pnl_pct: number
  }
  interface AssetsData {
    krw_balance: number
    coins: CoinHolding[]
    total_eval_krw: number
    error?: string
  }
  const [assets, setAssets] = useState<AssetsData | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsExpanded, setAssetsExpanded] = useState(true)

  const models = useChatStore((s) => s.models)
  const [selectedModel, setSelectedModel] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Timeframe label mapping (analysis interval)
  const tfLabelMap: Record<string, string> = {
    '5m': t('crypto.tf5m'),
    '10m': t('crypto.tf10m'),
    '15m': t('crypto.tf15m'),
    '30m': t('crypto.tf30m'),
    '1h': t('crypto.tf1h'),
    '4h': t('crypto.tf4h'),
  }

  // Candle interval label mapping
  const ciLabelMap: Record<string, string> = {
    '1m': t('crypto.ci1m'),
    '3m': t('crypto.ci3m'),
    '5m': t('crypto.ci5m'),
    '10m': t('crypto.ci10m'),
    '15m': t('crypto.ci15m'),
    '30m': t('crypto.ci30m'),
    '1h': t('crypto.ci1h'),
    '4h': t('crypto.ci4h'),
  }

  // Handle amount input with comma formatting
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      const num = Number(raw) || 0
      setAmountKrw(num)
      setAmountDisplay(raw === '' ? '' : formatComma(num))
    }
  }

  const handleAmountBlur = () => {
    setAmountDisplay(formatComma(amountKrw))
  }

  // Load initial status + history
  useEffect(() => {
    fetchStatus()
    fetchHistory(yesterdayStr(), todayStr())
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/autotrading/status`)
      if (res.ok) {
        const data = await res.json()
        if (data.running) {
          setIsRunning(true)
          setStatus(data)
          setCoin(data.coin || 'BTC')
          setTimeframe(data.timeframe || '15m')
          setCandleInterval(data.candle_interval || '15m')
          const amt = data.amount_krw || 100000
          setAmountKrw(amt)
          setAmountDisplay(formatComma(amt))
          setSelectedModel(data.model || '')
          setStrategy(data.strategy || 'llm')
        } else if (data.saved_config) {
          setCoin(data.saved_config.coin || 'BTC')
          setTimeframe(data.saved_config.timeframe || '15m')
          setCandleInterval(data.saved_config.candle_interval || '15m')
          const amt = data.saved_config.amount_krw || 100000
          setAmountKrw(amt)
          setAmountDisplay(formatComma(amt))
          setSelectedModel(data.saved_config.model || '')
          setStrategy(data.saved_config.strategy || 'llm')
        }
      }
    } catch {
      // ignore
    }
  }

  const fetchHistory = async (from?: string, to?: string) => {
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (from) params.set('from_date', from)
      if (to) params.set('to_date', to)
      const res = await fetch(`${BASE_URL}/api/autotrading/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTrades(data.trades || [])
      }
    } catch {
      // ignore
    }
  }

  // Fetch assets
  const fetchAssets = async () => {
    setAssetsLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/autotrading/assets`)
      if (res.ok) {
        const data = await res.json()
        setAssets(data)
      }
    } catch {
      // ignore
    } finally {
      setAssetsLoading(false)
    }
  }

  // Auto-refresh assets every 30s
  useEffect(() => {
    fetchAssets()
    const iv = setInterval(fetchAssets, 30000)
    return () => clearInterval(iv)
  }, [])

  // SSE stream
  useEffect(() => {
    if (!isRunning) return

    const controller = new AbortController()
    abortRef.current = controller

    const connect = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/autotrading/stream`, {
          signal: controller.signal,
        })
        if (!res.ok) return

        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'heartbeat' || data.type === 'status') {
                setStatus(data.content)
              } else if (data.type === 'progress') {
                setProgress(data.content)
              } else if (data.type === 'signal') {
                setProgress('')
              } else if (data.type === 'trade') {
                fetchHistory()
              } else if (data.type === 'error') {
                setError(data.content)
              } else if (data.type === 'warning') {
                setError(data.content)
              }
            } catch {
              // skip
            }
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          // Reconnect after delay
          setTimeout(connect, 5000)
        }
      }
    }
    connect()

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [isRunning])

  const handleStart = async () => {
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE_URL}/api/autotrading/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin,
          timeframe,
          candle_interval: candleInterval,
          amount_krw: amountKrw,
          model: selectedModel,
          language: i18n.language,
          strategy,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setError(err.detail || `HTTP ${res.status}`)
      } else {
        setIsRunning(true)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = async () => {
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE_URL}/api/autotrading/stop`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setError(err.detail || `HTTP ${res.status}`)
      } else {
        setIsRunning(false)
        setStatus(null)
        setProgress('')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to stop')
    } finally {
      setIsLoading(false)
    }
  }

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl_krw, 0)
  const totalFees = trades.reduce((sum, t) => sum + t.fee_krw, 0)
  const winCount = trades.filter((t) => t.pnl_pct > 0).length
  const winRate = trades.length > 0 ? ((winCount / trades.length) * 100).toFixed(1) : '0'

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Controls */}
      <div className="flex-shrink-0 border-b border-slate-800 px-5 py-4 space-y-3">
        {/* Coin selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            {t('crypto.coin')}
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {COINS.map((c) => {
              const isSelected = coin === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setCoin(c.id)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'text-white shadow-lg'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: c.color, boxShadow: `0 4px 12px ${c.color}40` }
                      : undefined
                  }
                >
                  {c.id}
                </button>
              )
            })}
          </div>
        </div>

        {/* Timeframe (analysis interval) */}
        <div className="flex gap-6 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              {t('crypto.timeframe')}
            </label>
            <div className="flex gap-1">
              {TIMEFRAME_IDS.map((tfId) => (
                <button
                  key={tfId}
                  onClick={() => setTimeframe(tfId)}
                  disabled={isRunning}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    timeframe === tfId
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {tfLabelMap[tfId] || tfId}
                </button>
              ))}
            </div>
          </div>

          {/* Candle Interval */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              {t('crypto.candleInterval')}
            </label>
            <div className="flex gap-1">
              {CANDLE_IDS.map((ciId) => (
                <button
                  key={ciId}
                  onClick={() => setCandleInterval(ciId)}
                  disabled={isRunning}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    candleInterval === ciId
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {ciLabelMap[ciId] || ciId}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Amount + Strategy + Model + Button */}
        <div className="flex gap-4 flex-wrap items-end">
          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              {t('crypto.tradeAmount')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={handleAmountChange}
              onBlur={handleAmountBlur}
              disabled={isRunning}
              className="w-36 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-amber-500 text-right"
            />
          </div>

          {/* Strategy (Judgment Mode) */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              {t('crypto.judgmentMode')}
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-1">
                <button
                  onClick={() => setStrategy('llm')}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    strategy === 'llm'
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {t('crypto.llmMode')}
                </button>
                <button
                  onClick={() => setStrategy('rule')}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    strategy === 'rule'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {t('crypto.ruleMode')}
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowStrategyHelp(!showStrategyHelp)}
                  onMouseEnter={() => setShowStrategyHelp(true)}
                  onMouseLeave={() => setShowStrategyHelp(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <HelpCircle size={14} />
                </button>
                {showStrategyHelp && (
                  <div className="absolute z-50 left-6 top-1/2 -translate-y-1/2 w-72 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl text-xs text-slate-300 leading-relaxed">
                    <div className="mb-2">
                      <span className="font-bold text-violet-400">{t('crypto.llmMode')}</span>
                      <p className="mt-0.5 text-slate-400">{t('crypto.strategyHelpLlm')}</p>
                    </div>
                    <div className="mb-2">
                      <span className="font-bold text-emerald-400">{t('crypto.ruleMode')}</span>
                      <p className="mt-0.5 text-slate-400">{t('crypto.strategyHelpRule')}</p>
                    </div>
                    <div className="border-t border-slate-700 pt-1.5 text-slate-500">
                      {t('crypto.strategyHelpCommon')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Model (hidden in rule mode) */}
          {strategy === 'llm' && (
          <div className="relative">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              {t('crypto.aiModel')}
            </label>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={isRunning}
              className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:border-slate-600 transition-colors min-w-[160px]"
            >
              <span className="truncate text-xs">{selectedModel || t('crypto.selectModel')}</span>
              <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
            </button>
            {showModelDropdown && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[200px]">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id)
                      setShowModelDropdown(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                      selectedModel === m.id ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {m.id}
                    <span className="text-xs text-slate-500 ml-2">{m.provider}</span>
                  </button>
                ))}
                {models.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500">{t('crypto.noModels')}</div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Start / Stop */}
          <div className="ml-auto self-end">
            {isRunning ? (
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                {t('crypto.stopTrading')}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={isLoading || (strategy === 'llm' && !selectedModel) || !coin}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {t('crypto.startTrading')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-5 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400/50 hover:text-red-400">
            &times;
          </button>
        </div>
      )}

      {/* Progress */}
      {isRunning && progress && (
        <div className="flex-shrink-0 mx-5 mt-3 flex items-center gap-2 text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">{progress}</span>
        </div>
      )}

      {/* Assets */}
      {assets && !assets.error && (
        <div className="flex-shrink-0 border-b border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setAssetsExpanded(!assetsExpanded)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
            >
              <Wallet size={14} className="text-amber-400" />
              {t('crypto.assets')}
              {assetsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <button
              onClick={fetchAssets}
              disabled={assetsLoading}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <RefreshCw size={11} className={assetsLoading ? 'animate-spin' : ''} />
              {t('crypto.refreshAssets')}
            </button>
          </div>
          {assetsExpanded && (
            <div className="space-y-2">
              {/* KRW + Total */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-500">{t('crypto.krwBalance')}</div>
                  <div className="text-sm font-bold text-slate-100">₩{(assets.krw_balance || 0).toLocaleString()}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-500">{t('crypto.totalEval')}</div>
                  <div className="text-sm font-bold text-amber-400">₩{(assets.total_eval_krw || 0).toLocaleString()}</div>
                </div>
              </div>
              {/* Coin Holdings */}
              {assets.coins.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 text-slate-400">
                        <th className="text-left px-3 py-1.5 font-medium">{t('crypto.thCoin')}</th>
                        <th className="text-right px-3 py-1.5 font-medium">{t('crypto.holdings')}</th>
                        <th className="text-right px-3 py-1.5 font-medium">{t('crypto.avgBuyPrice')}</th>
                        <th className="text-right px-3 py-1.5 font-medium">{t('crypto.currentPrice')}</th>
                        <th className="text-right px-3 py-1.5 font-medium">{t('crypto.evalAmount')}</th>
                        <th className="text-right px-3 py-1.5 font-medium">{t('crypto.returnRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.coins.map((c) => (
                        <tr key={c.currency} className="border-t border-slate-800/50">
                          <td className="px-3 py-1.5 text-slate-200 font-medium">{c.currency}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{c.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td className="px-3 py-1.5 text-right text-slate-400">₩{c.avg_buy_price.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">₩{c.current_price.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">₩{c.eval_krw.toLocaleString()}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${c.pnl_pct > 0 ? 'text-emerald-400' : c.pnl_pct < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {c.pnl_pct > 0 ? '+' : ''}{c.pnl_pct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-2">{t('crypto.noHoldings')}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Live Dashboard */}
      {isRunning && status && (
        <div className="flex-shrink-0 border-b border-slate-800 px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <DashCard
              label={t('crypto.currentPrice')}
              value={`₩${(status.current_price || 0).toLocaleString()}`}
              color="text-slate-100"
            />
            <DashCard
              label={t('crypto.position')}
              value={status.in_position ? t('crypto.positionIn') : t('crypto.positionOut')}
              color={status.in_position ? 'text-emerald-400' : 'text-slate-400'}
            />
            <DashCard
              label={t('crypto.unrealizedPnl')}
              value={
                status.in_position
                  ? `${status.unrealized_pct >= 0 ? '+' : ''}${status.unrealized_pct.toFixed(2)}% (₩${status.unrealized_krw.toLocaleString()})`
                  : '-'
              }
              color={status.unrealized_pct > 0 ? 'text-emerald-400' : status.unrealized_pct < 0 ? 'text-red-400' : 'text-slate-400'}
            />
            <DashCard
              label={t('crypto.todayPnl')}
              value={`₩${(status.today_pnl_krw || 0).toLocaleString()} (${t('crypto.todayTradesCount', { count: status.today_trades || 0 })})`}
              color={status.today_pnl_krw > 0 ? 'text-emerald-400' : status.today_pnl_krw < 0 ? 'text-red-400' : 'text-slate-400'}
            />
          </div>

          {/* Last Signal – AI Analysis */}
          {status.last_signal && status.last_signal.action && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={14} className="text-violet-400" />
                <span className="text-xs font-semibold text-violet-400 uppercase">{t('crypto.analysisResult')}</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    status.last_signal.action === 'BUY'
                      ? 'bg-emerald-600/20 text-emerald-400'
                      : status.last_signal.action === 'SELL'
                        ? 'bg-red-600/20 text-red-400'
                        : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {status.last_signal.action}
                </span>
                <span className="text-xs text-slate-500">
                  {t('crypto.confidence')}: {((status.last_signal.confidence || 0) * 100).toFixed(0)}%
                </span>
              </div>
              {/* Signal details row */}
              <div className="flex gap-4 mb-2 text-xs">
                {status.last_signal.expected_move_pct != null && (
                  <span className="text-slate-400">
                    {t('crypto.expectedMove')}: <span className="text-slate-200">{status.last_signal.expected_move_pct > 0 ? '+' : ''}{status.last_signal.expected_move_pct}%</span>
                  </span>
                )}
                {status.last_signal.stop_loss_pct != null && (
                  <span className="text-slate-400">
                    {t('crypto.stopLoss')}: <span className="text-red-400">{status.last_signal.stop_loss_pct}%</span>
                  </span>
                )}
                {status.last_signal.take_profit_pct != null && (
                  <span className="text-slate-400">
                    {t('crypto.takeProfit')}: <span className="text-emerald-400">+{status.last_signal.take_profit_pct}%</span>
                  </span>
                )}
              </div>
              {/* Reasoning */}
              <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded p-2 border border-slate-700/30">
                {status.last_signal.reasoning}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade History */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-slate-300">
            {t('crypto.tradeHistory')} ({t('crypto.tradeCount', { count: trades.length })})
          </h3>
          {/* Date Range Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">{t('crypto.dateFrom')}</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs outline-none focus:ring-1 focus:ring-amber-500"
            />
            <span className="text-slate-500">{t('crypto.dateTo')}</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              onClick={() => fetchHistory(filterFrom, filterTo)}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors"
            >
              {t('crypto.search')}
            </button>
            {(filterFrom || filterTo) && (
              <button
                onClick={() => {
                  setFilterFrom('')
                  setFilterTo('')
                  fetchHistory()
                }}
                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-medium transition-colors"
              >
                {t('crypto.allPeriod')}
              </button>
            )}
          </div>
        </div>
        {/* Summary stats */}
        {trades.length > 0 && (
          <div className="flex gap-4 text-xs mb-3">
            <span className={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {t('crypto.totalPnl')}: ₩{totalPnl.toLocaleString()}
            </span>
            <span className="text-slate-500">{t('crypto.totalFees')}: ₩{totalFees.toLocaleString()}</span>
            <span className="text-slate-500">{t('crypto.winRate')}: {winRate}%</span>
          </div>
        )}

        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
            {t('crypto.noTrades')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/80 text-slate-400">
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thTime')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thCoin')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thTimeframe')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thEntryPrice')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thExitPrice')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thAmount')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thPnlRate')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thFee')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thStrategy')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isExpanded = expandedTradeId === trade.id
                  return (
                    <Fragment key={trade.id}>
                      <tr
                        className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                      >
                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight
                              size={10}
                              className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            {formatTime(trade.exit_time)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-200 font-medium">{trade.coin}</td>
                        <td className="px-3 py-1.5 text-slate-400">{trade.timeframe}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          ₩{trade.entry_price.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          ₩{trade.exit_price.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          ₩{trade.amount_krw.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-medium ${
                            trade.pnl_pct > 0
                              ? 'text-emerald-400'
                              : trade.pnl_pct < 0
                                ? 'text-red-400'
                                : 'text-slate-400'
                          }`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {trade.pnl_pct > 0 ? (
                              <ArrowUpRight size={10} />
                            ) : trade.pnl_pct < 0 ? (
                              <ArrowDownRight size={10} />
                            ) : (
                              <Minus size={10} />
                            )}
                            {trade.pnl_pct > 0 ? '+' : ''}
                            {trade.pnl_pct.toFixed(2)}%
                          </span>
                          <div className="text-slate-500 font-normal">
                            ₩{trade.pnl_krw.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-500">
                          ₩{trade.fee_krw.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400 max-w-[200px] truncate" title={trade.reasoning}>
                          {trade.reasoning}
                        </td>
                      </tr>
                      {/* Expanded analysis row */}
                      {isExpanded && (
                        <tr className="bg-slate-800/40">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Brain size={12} className="text-violet-400" />
                              <span className="text-xs font-semibold text-violet-400">{t('crypto.analysisResult')}</span>
                            </div>
                            <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded p-2.5 border border-slate-700/30">
                              {trade.reasoning || '-'}
                            </div>
                            <div className="flex gap-4 mt-2 text-xs text-slate-500">
                              <span>{t('crypto.candleInterval')}: {trade.candle_interval || '-'}</span>
                              <span>{t('crypto.thTime')}: {trade.entry_time ? formatTime(trade.entry_time) : '-'} → {formatTime(trade.exit_time)}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DashCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function formatTime(iso: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.slice(0, 16)
  }
}
