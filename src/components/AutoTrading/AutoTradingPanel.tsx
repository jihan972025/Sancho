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
  ShoppingCart,
  BadgeDollarSign,
  X,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '../../stores/chatStore'
import CoinSearchPopup from './CoinSearchPopup'

const BASE_URL = 'http://127.0.0.1:8765'

interface CoinDef {
  id: string
  name: string
  color: string
  price?: number
  volume_24h?: number
}

// Exchange definitions
const EXCHANGES = [
  { id: 'upbit',    name: 'Upbit',    quote: 'KRW', cs: '₩' },
  { id: 'binance',  name: 'Binance',  quote: 'USDT', cs: '$' },
  { id: 'coinbase', name: 'Coinbase', quote: 'USDT', cs: '$' },
  { id: 'bybit',    name: 'Bybit',    quote: 'USDT', cs: '$' },
  { id: 'okx',      name: 'OKX',      quote: 'USDT', cs: '$' },
  { id: 'kraken',   name: 'Kraken',   quote: 'USD',  cs: '$' },
  { id: 'mexc',     name: 'MEXC',     quote: 'USDT', cs: '$' },
  { id: 'gateio',   name: 'Gate.io',  quote: 'USDT', cs: '$' },
  { id: 'kucoin',   name: 'KuCoin',   quote: 'USDT', cs: '$' },
  { id: 'bitget',   name: 'Bitget',   quote: 'USDT', cs: '$' },
  { id: 'htx',      name: 'HTX',      quote: 'USDT', cs: '$' },
] as const

const TIMEFRAME_IDS = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '4h'] as const
const CANDLE_IDS = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const

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
  buy_reasoning?: string
  sell_reasoning?: string
  entry_time: string
  exit_time: string
  status?: 'open' | 'closed'
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
    input_prompt?: string
    raw_response?: string
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
  const [selectedExchange, setSelectedExchange] = useState('upbit')
  const [coins, setCoins] = useState<CoinDef[]>([])
  const [coinsLoading, setCoinsLoading] = useState(true)
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
  const [assetsExpanded, setAssetsExpanded] = useState(false)
  const [hideZeroBalance, setHideZeroBalance] = useState(true)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [inputPromptExpanded, setInputPromptExpanded] = useState(false)
  const [outputPromptExpanded, setOutputPromptExpanded] = useState(false)

  // Coin search popup state
  const [showCoinSearch, setShowCoinSearch] = useState(false)
  const [showManualCoinSearch, setShowManualCoinSearch] = useState(false)

  // Manual trade state
  const [manualModal, setManualModal] = useState<'buy' | 'sell' | null>(null)
  const [manualCoin, setManualCoin] = useState('BTC')
  const [manualAmountDisplay, setManualAmountDisplay] = useState('10,000')
  const [manualAmountKrw, setManualAmountKrw] = useState(10000)
  const [manualSellQty, setManualSellQty] = useState('')
  const [manualSellAll, setManualSellAll] = useState(true)
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  const models = useChatStore((s) => s.models)
  const [selectedModel, setSelectedModel] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Timeframe label mapping (analysis interval)
  const tfLabelMap: Record<string, string> = {
    '1m': t('crypto.tf1m'),
    '3m': t('crypto.tf3m'),
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
    '1d': t('crypto.ci1d'),
    '1w': t('crypto.ci1w'),
    '1M': t('crypto.ci1M'),
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

  const currentExchange = EXCHANGES.find((e) => e.id === selectedExchange) || EXCHANGES[0]

  // Load available coins from selected exchange
  useEffect(() => {
    const loadCoins = async () => {
      try {
        setCoinsLoading(true)
        const res = await fetch(`${BASE_URL}/api/autotrading/available-coins?exchange=${selectedExchange}`)
        if (res.ok) {
          const data = await res.json()
          if (data.coins && data.coins.length > 0) {
            const mapped = data.coins.map((c: any, i: number) => ({
              id: c.id,
              name: c.name || c.id,
              color: `hsl(${(i * 360) / data.coins.length}, 70%, 60%)`,
              price: c.price || 0,
              volume_24h: c.volume_24h || 0,
            }))
            setCoins(mapped)
            // Reset coin to BTC if current coin not in new list
            if (!mapped.some((c: CoinDef) => c.id === coin)) {
              setCoin(mapped[0]?.id || 'BTC')
            }
          }
        }
      } catch (err) {
        console.error('Failed to load coins:', err)
        setCoins([
          { id: 'BTC', name: 'Bitcoin', color: '#f7931a' },
          { id: 'ETH', name: 'Ethereum', color: '#627eea' },
        ])
      } finally {
        setCoinsLoading(false)
      }
    }
    loadCoins()
  }, [selectedExchange])

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
          setSelectedExchange(data.exchange || 'upbit')
        } else if (data.saved_config) {
          setCoin(data.saved_config.coin || 'BTC')
          setTimeframe(data.saved_config.timeframe || '15m')
          setCandleInterval(data.saved_config.candle_interval || '15m')
          const amt = data.saved_config.amount_krw || 100000
          setAmountKrw(amt)
          setAmountDisplay(formatComma(amt))
          setSelectedModel(data.saved_config.model || '')
          setStrategy(data.saved_config.strategy || 'llm')
          setSelectedExchange(data.saved_config.exchange || 'upbit')
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
      const res = await fetch(`${BASE_URL}/api/autotrading/assets?exchange=${selectedExchange}`)
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
  }, [selectedExchange])

  // Manual trade handlers
  const handleManualAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      const num = Number(raw) || 0
      setManualAmountKrw(num)
      setManualAmountDisplay(raw === '' ? '' : formatComma(num))
    }
  }

  const openManualBuy = (coinId?: string) => {
    setManualCoin(coinId || coin)
    setManualAmountDisplay(formatComma(amountKrw))
    setManualAmountKrw(amountKrw)
    setManualResult(null)
    setManualError(null)
    setManualModal('buy')
  }

  const openManualSell = (coinId?: string) => {
    setManualCoin(coinId || coin)
    setManualSellAll(true)
    setManualSellQty('')
    setManualResult(null)
    setManualError(null)
    setManualModal('sell')
  }

  const executeManualBuy = async () => {
    setManualLoading(true)
    setManualError(null)
    setManualResult(null)
    try {
      const res = await fetch(`${BASE_URL}/api/autotrading/manual-buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: manualCoin, amount_krw: manualAmountKrw, exchange: selectedExchange }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setManualError(err.detail || `HTTP ${res.status}`)
        return
      }
      const data = await res.json()
      setManualResult(
        `${t('crypto.manualBuySuccess', { coin: data.coin, price: data.price?.toLocaleString(), quantity: data.quantity?.toLocaleString(undefined, { maximumFractionDigits: 8 }) })}`
      )
      fetchAssets()
    } catch (e: any) {
      setManualError(e.message || 'Manual buy failed')
    } finally {
      setManualLoading(false)
    }
  }

  const executeManualSell = async () => {
    setManualLoading(true)
    setManualError(null)
    setManualResult(null)
    try {
      const body: any = { coin: manualCoin, exchange: selectedExchange }
      if (!manualSellAll && manualSellQty) {
        body.quantity = parseFloat(manualSellQty)
      }
      const res = await fetch(`${BASE_URL}/api/autotrading/manual-sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setManualError(err.detail || `HTTP ${res.status}`)
        return
      }
      const data = await res.json()
      setManualResult(
        `${t('crypto.manualSellSuccess', { coin: data.coin, price: data.price?.toLocaleString(), quantity: data.quantity?.toLocaleString(undefined, { maximumFractionDigits: 8 }), krw: data.est_krw?.toLocaleString() })}`
      )
      fetchAssets()
    } catch (e: any) {
      setManualError(e.message || 'Manual sell failed')
    } finally {
      setManualLoading(false)
    }
  }

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
          exchange: selectedExchange,
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
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto">
      {/* Controls */}
      <div className="border-b border-slate-800 px-5 py-4 space-y-3">
        {/* Exchange + Coin selection */}
        <div className="flex gap-4 items-end">
        {/* Exchange selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            {t('crypto.exchange', 'Exchange')}
          </label>
          <div className="flex gap-1 flex-wrap">
            {EXCHANGES.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setSelectedExchange(ex.id)}
                disabled={isRunning}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  selectedExchange === ex.id
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        {/* Coin selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            {t('crypto.coin')}
            {coinsLoading && <Loader2 size={10} className="inline ml-2 animate-spin" />}
          </label>
          <button
            onClick={() => setShowCoinSearch(true)}
            disabled={isRunning || coinsLoading}
            className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-750 hover:border-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: coins.find((c) => c.id === coin)?.color || '#5c7cfa' }}
            />
            <span className="font-bold text-sm text-white">{coin}</span>
            <span className="text-slate-500 text-xs">{coins.find((c) => c.id === coin)?.name || ''}</span>
            <Search size={13} className="text-slate-500 ml-1" />
          </button>
        </div>
        </div>
        {showCoinSearch && (
          <CoinSearchPopup
            coins={coins}
            selectedCoin={coin}
            onSelect={(id) => setCoin(id)}
            onClose={() => setShowCoinSearch(false)}
            disabled={isRunning}
          />
        )}

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
        <div className="mx-5 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400/50 hover:text-red-400">
            &times;
          </button>
        </div>
      )}

      {/* Progress */}
      {isRunning && progress && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">{progress}</span>
        </div>
      )}

      {/* Assets */}
      {assets && !assets.error && (
        <div className="border-b border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setAssetsExpanded(!assetsExpanded)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
            >
              <Wallet size={14} className="text-amber-400" />
              {t('crypto.assets')}
              {assetsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openManualBuy()}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors"
              >
                <ShoppingCart size={11} />
                {t('crypto.manualBuy')}
              </button>
              <button
                onClick={() => openManualSell()}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
              >
                <BadgeDollarSign size={11} />
                {t('crypto.manualSell')}
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
          </div>
          {assetsExpanded && (
            <div className="space-y-2">
              {/* KRW + Total */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-500">{t('crypto.krwBalance')}</div>
                  <div className="text-sm font-bold text-slate-100">{currentExchange.cs}{(assets.krw_balance || 0).toLocaleString()}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                  <div className="text-xs text-slate-500">{t('crypto.totalEval')}</div>
                  <div className="text-sm font-bold text-amber-400">{currentExchange.cs}{(assets.total_eval_krw || 0).toLocaleString()}</div>
                </div>
              </div>
              {/* Hide zero balance checkbox */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideZeroBalance}
                  onChange={(e) => setHideZeroBalance(e.target.checked)}
                  className="accent-amber-500 w-3.5 h-3.5"
                />
                <span className="text-xs text-slate-400">{t('crypto.hideZeroBalance')}</span>
              </label>
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
                        <th className="text-center px-3 py-1.5 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.coins.filter((c) => !hideZeroBalance || c.eval_krw > 0).map((c) => (
                        <tr key={c.currency} className="border-t border-slate-800/50">
                          <td className="px-3 py-1.5 text-slate-200 font-medium">{c.currency}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{c.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td className="px-3 py-1.5 text-right text-slate-400">{currentExchange.cs}{c.avg_buy_price.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{currentExchange.cs}{c.current_price.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{currentExchange.cs}{c.eval_krw.toLocaleString()}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${c.pnl_pct > 0 ? 'text-emerald-400' : c.pnl_pct < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {c.pnl_pct > 0 ? '+' : ''}{c.pnl_pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); openManualBuy(c.currency) }}
                                className="px-2 py-0.5 text-[10px] font-medium bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded transition-colors"
                              >
                                {t('crypto.buy')}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openManualSell(c.currency) }}
                                className="px-2 py-0.5 text-[10px] font-medium bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded transition-colors"
                              >
                                {t('crypto.sell')}
                              </button>
                            </div>
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
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <DashCard
              label={t('crypto.currentPrice')}
              value={`${currentExchange.cs}${(status.current_price || 0).toLocaleString()}`}
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
                  ? `${status.unrealized_pct >= 0 ? '+' : ''}${status.unrealized_pct.toFixed(2)}% (${currentExchange.cs}${status.unrealized_krw.toLocaleString()})`
                  : '-'
              }
              color={status.unrealized_pct > 0 ? 'text-emerald-400' : status.unrealized_pct < 0 ? 'text-red-400' : 'text-slate-400'}
            />
            <DashCard
              label={t('crypto.todayPnl')}
              value={`${currentExchange.cs}${(status.today_pnl_krw || 0).toLocaleString()} (${t('crypto.todayTradesCount', { count: status.today_trades || 0 })})`}
              color={status.today_pnl_krw > 0 ? 'text-emerald-400' : status.today_pnl_krw < 0 ? 'text-red-400' : 'text-slate-400'}
            />
          </div>

          {/* Prompt Accordion */}
          {status.last_signal && status.last_signal.action && (
            <div className="mt-3">
              <button
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors mb-2"
              >
                <Brain size={14} className="text-violet-400" />
                {t('crypto.prompt')}
                {promptExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {promptExpanded && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
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

                  {/* Input Prompt Accordion */}
                  {status.last_signal.input_prompt && (
                    <div className="mt-2">
                      <button
                        onClick={() => setInputPromptExpanded(!inputPromptExpanded)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {inputPromptExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {t('crypto.inputPrompt')}
                      </button>
                      {inputPromptExpanded && (
                        <div className="mt-1 text-xs text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-900/70 rounded p-2 border border-slate-700/30 max-h-60 overflow-y-auto font-mono">
                          {status.last_signal.input_prompt}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Output Response Accordion */}
                  {status.last_signal.raw_response && (
                    <div className="mt-2">
                      <button
                        onClick={() => setOutputPromptExpanded(!outputPromptExpanded)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {outputPromptExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {t('crypto.outputPrompt')}
                      </button>
                      {outputPromptExpanded && (
                        <div className="mt-1 text-xs text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-900/70 rounded p-2 border border-slate-700/30 max-h-60 overflow-y-auto font-mono">
                          {status.last_signal.raw_response}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trade History */}
      <div className="px-5 py-4">
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
              {t('crypto.totalPnl')}: {currentExchange.cs}{totalPnl.toLocaleString()}
            </span>
            <span className="text-slate-500">{t('crypto.totalFees')}: {currentExchange.cs}{totalFees.toLocaleString()}</span>
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
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thCandleInterval')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thEntryPrice')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thExitPrice')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thAmount')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thPnlRate')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('crypto.thFee')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thBuyStrategy')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('crypto.thSellStrategy')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isExpanded = expandedTradeId === trade.id
                  const isOpen = trade.status === 'open' || (!trade.exit_time && !trade.exit_price)
                  return (
                    <Fragment key={trade.id}>
                      <tr
                        className={`border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer ${isOpen ? 'bg-emerald-900/10' : ''}`}
                        onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                      >
                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight
                              size={10}
                              className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            {isOpen ? formatTime(trade.entry_time) : formatTime(trade.exit_time)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-200 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {trade.coin}
                            {isOpen && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-400 leading-none">
                                {t('crypto.holding')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">{trade.timeframe}</td>
                        <td className="px-3 py-1.5 text-slate-400">{trade.candle_interval || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          {currentExchange.cs}{trade.entry_price.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          {isOpen ? <span className="text-slate-500">-</span> : `${currentExchange.cs}${trade.exit_price.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-300">
                          {currentExchange.cs}{trade.amount_krw.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-medium ${
                            isOpen
                              ? 'text-slate-500'
                              : trade.pnl_pct > 0
                                ? 'text-emerald-400'
                                : trade.pnl_pct < 0
                                  ? 'text-red-400'
                                  : 'text-slate-400'
                          }`}
                        >
                          {isOpen ? (
                            <span className="text-slate-500">-</span>
                          ) : (
                            <>
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
                                {currentExchange.cs}{trade.pnl_krw.toLocaleString()}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-500">
                          {isOpen ? '-' : `${currentExchange.cs}${trade.fee_krw.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-1.5 text-emerald-400/80 max-w-[200px] truncate" title={trade.buy_reasoning || trade.reasoning}>
                          {trade.buy_reasoning || '-'}
                        </td>
                        <td className="px-3 py-1.5 text-red-400/80 max-w-[200px] truncate" title={trade.sell_reasoning || trade.reasoning}>
                          {isOpen ? '-' : (trade.sell_reasoning || trade.reasoning)}
                        </td>
                      </tr>
                      {/* Expanded analysis row */}
                      {isExpanded && (
                        <tr className="bg-slate-800/40">
                          <td colSpan={11} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Brain size={12} className="text-violet-400" />
                              <span className="text-xs font-semibold text-violet-400">{t('crypto.analysisResult')}</span>
                            </div>
                            {(trade.buy_reasoning || isOpen) && (
                              <div className="mb-2">
                                <span className="text-xs font-medium text-emerald-400">{t('crypto.thBuyStrategy')}</span>
                                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded p-2.5 border border-slate-700/30 mt-1">
                                  {trade.buy_reasoning || trade.reasoning || '-'}
                                </div>
                              </div>
                            )}
                            {!isOpen && (
                              <div className="mb-2">
                                <span className="text-xs font-medium text-red-400">{t('crypto.thSellStrategy')}</span>
                                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded p-2.5 border border-slate-700/30 mt-1">
                                  {trade.sell_reasoning || trade.reasoning || '-'}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-4 mt-2 text-xs text-slate-500">
                              <span>{t('crypto.thTime')}: {trade.entry_time ? formatTime(trade.entry_time) : '-'} {isOpen ? `(${t('crypto.holding')})` : `→ ${formatTime(trade.exit_time)}`}</span>
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

      {/* Manual Trade Modal */}
      {manualModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[360px] max-w-[90vw]">
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b border-slate-700 rounded-t-xl ${
              manualModal === 'buy' ? 'bg-emerald-600/10' : 'bg-red-600/10'
            }`}>
              <div className="flex items-center gap-2">
                {manualModal === 'buy' ? (
                  <ShoppingCart size={16} className="text-emerald-400" />
                ) : (
                  <BadgeDollarSign size={16} className="text-red-400" />
                )}
                <span className={`font-semibold text-sm ${
                  manualModal === 'buy' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {manualModal === 'buy' ? t('crypto.manualBuy') : t('crypto.manualSell')}
                </span>
              </div>
              <button
                onClick={() => setManualModal(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Coin selector */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {t('crypto.coin')}
                  {coinsLoading && <Loader2 size={10} className="inline ml-2 animate-spin" />}
                </label>
                <button
                  onClick={() => setShowManualCoinSearch(true)}
                  disabled={coinsLoading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg hover:bg-slate-800 hover:border-slate-500 transition-all w-full"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: coins.find((c) => c.id === manualCoin)?.color || '#5c7cfa' }}
                  />
                  <span className="font-semibold text-sm text-white">{manualCoin}</span>
                  <span className="text-slate-500 text-xs truncate">{coins.find((c) => c.id === manualCoin)?.name || ''}</span>
                  <Search size={12} className="text-slate-500 ml-auto" />
                </button>
                {showManualCoinSearch && (
                  <CoinSearchPopup
                    coins={coins}
                    selectedCoin={manualCoin}
                    onSelect={(id) => setManualCoin(id)}
                    onClose={() => setShowManualCoinSearch(false)}
                  />
                )}
              </div>

              {/* Buy: Amount input */}
              {manualModal === 'buy' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('crypto.tradeAmount')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualAmountDisplay}
                      onChange={handleManualAmountChange}
                      onBlur={() => setManualAmountDisplay(formatComma(manualAmountKrw))}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 text-right"
                    />
                    <span className="text-xs text-slate-500">{currentExchange.quote}</span>
                  </div>
                  {/* Quick amount buttons */}
                  <div className="flex gap-1.5 mt-2">
                    {[5000, 10000, 50000, 100000].map((v) => (
                      <button
                        key={v}
                        onClick={() => { setManualAmountKrw(v); setManualAmountDisplay(formatComma(v)) }}
                        className="px-2 py-1 text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                      >
                        {formatComma(v)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sell: Quantity input */}
              {manualModal === 'sell' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('crypto.sellQuantity')}
                  </label>
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={manualSellAll}
                        onChange={() => setManualSellAll(true)}
                        className="accent-red-500"
                      />
                      <span className="text-xs text-slate-300">{t('crypto.sellAll')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={!manualSellAll}
                        onChange={() => setManualSellAll(false)}
                        className="accent-red-500"
                      />
                      <span className="text-xs text-slate-300">{t('crypto.sellPartial')}</span>
                    </label>
                  </div>
                  {!manualSellAll && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualSellQty}
                        onChange={(e) => setManualSellQty(e.target.value)}
                        placeholder="0.0"
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-red-500 text-right"
                      />
                      <span className="text-xs text-slate-500">{manualCoin}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {manualError && (
                <div className="p-2.5 bg-red-600/10 border border-red-500/30 rounded-lg text-xs text-red-400 leading-relaxed flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{manualError}</span>
                </div>
              )}

              {/* Result message */}
              {manualResult && (
                <div className="p-2.5 bg-emerald-600/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 leading-relaxed">
                  {manualResult}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-700">
              <button
                onClick={() => setManualModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                {(manualResult || manualError) ? t('crypto.close') : t('crypto.cancel')}
              </button>
              {!manualResult && (
                <button
                  onClick={manualModal === 'buy' ? executeManualBuy : executeManualSell}
                  disabled={manualLoading || (manualModal === 'buy' && manualAmountKrw < 5000) || (manualModal === 'sell' && !manualSellAll && !manualSellQty)}
                  className={`flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    manualModal === 'buy'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {manualLoading && <Loader2 size={12} className="animate-spin" />}
                  {manualModal === 'buy' ? t('crypto.confirmBuy') : t('crypto.confirmSell')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
