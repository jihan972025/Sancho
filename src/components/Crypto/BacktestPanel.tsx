import { useState, useRef, useEffect } from 'react'
import { Play, Square, Loader2, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, Newspaper, Brain } from 'lucide-react'
import { COINS } from './CryptoPanel'
import { useChatStore } from '../../stores/chatStore'

const BASE_URL = 'http://127.0.0.1:8765'

interface StrategyOption {
  id: string
  name: string
  params: ParamDef[]
}

interface ParamDef {
  key: string
  label: string
  default: number
  min?: number
  max?: number
  step?: number
}

const BACKTEST_STRATEGIES: StrategyOption[] = [
  {
    id: 'sma_cross',
    name: 'SMA Cross',
    params: [
      { key: 'short_period', label: 'Short MA', default: 20, min: 5, max: 100 },
      { key: 'long_period', label: 'Long MA', default: 50, min: 10, max: 200 },
    ],
  },
  {
    id: 'rsi',
    name: 'RSI',
    params: [
      { key: 'period', label: 'Period', default: 14, min: 5, max: 50 },
      { key: 'oversold', label: 'Oversold', default: 30, min: 10, max: 50 },
      { key: 'overbought', label: 'Overbought', default: 70, min: 50, max: 90 },
    ],
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    params: [
      { key: 'period', label: 'Period', default: 20, min: 10, max: 50 },
      { key: 'std_dev', label: 'Std Dev', default: 2.0, min: 1.0, max: 3.0, step: 0.1 },
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    params: [
      { key: 'fast', label: 'Fast', default: 12, min: 5, max: 30 },
      { key: 'slow', label: 'Slow', default: 26, min: 15, max: 50 },
      { key: 'signal', label: 'Signal', default: 9, min: 3, max: 20 },
    ],
  },
  {
    id: 'triple_filter',
    name: 'Triple Filter (MA+BB+RSI)',
    params: [
      { key: 'ma_short', label: 'Short MA', default: 20, min: 5, max: 60 },
      { key: 'ma_long', label: 'Long MA', default: 60, min: 20, max: 200 },
      { key: 'bb_period', label: 'BB Period', default: 20, min: 10, max: 50 },
      { key: 'bb_std', label: 'BB Std', default: 2.0, min: 1.0, max: 3.0, step: 0.1 },
      { key: 'rsi_period', label: 'RSI Period', default: 14, min: 5, max: 30 },
      { key: 'rsi_buy', label: 'RSI Buy', default: 40, min: 20, max: 50 },
      { key: 'rsi_sell', label: 'RSI Sell', default: 70, min: 50, max: 90 },
    ],
  },
  {
    id: 'sentiment',
    name: 'Sentiment (SMA + News AI)',
    params: [
      { key: 'ma_short', label: 'Short MA', default: 20, min: 5, max: 100 },
      { key: 'ma_long', label: 'Long MA', default: 50, min: 10, max: 200 },
      { key: 'news_count', label: 'News', default: 5, min: 3, max: 10 },
    ],
  },
  {
    id: 'drl',
    name: 'DRL (Q-Learning AI)',
    params: [
      { key: 'episodes', label: 'Episodes', default: 500, min: 100, max: 2000, step: 100 },
      { key: 'lookback', label: 'Lookback', default: 10, min: 5, max: 30 },
      { key: 'lr', label: 'Learn Rate', default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { key: 'gamma', label: 'Gamma', default: 0.95, min: 0.8, max: 0.99, step: 0.01 },
    ],
  },
  {
    id: 'ml_boost',
    name: 'ML Gradient Boosting',
    params: [
      { key: 'train_ratio', label: 'Train %', default: 0.7, min: 0.5, max: 0.9, step: 0.05 },
      { key: 'n_trees', label: 'Trees', default: 50, min: 10, max: 200, step: 10 },
      { key: 'max_depth', label: 'Depth', default: 3, min: 1, max: 6 },
      { key: 'learning_rate', label: 'LR', default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { key: 'threshold', label: 'Threshold', default: 0.5, min: 0.4, max: 0.7, step: 0.05 },
    ],
  },
]

const BT_TIMEFRAMES = [
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: 'Daily' },
]

const BT_PERIODS = [
  { id: 90, label: '90d' },
  { id: 180, label: '180d' },
  { id: 365, label: '1Y' },
]

interface Trade {
  type: string
  entry_ts: number
  entry_price: number
  exit_ts: number
  exit_price: number
  pnl_pct: number
  hold_bars: number
  entry_date: string
  exit_date: string
}

interface Metrics {
  total_return: number
  cagr: number
  mdd: number
  win_rate: number
  total_trades: number
  avg_hold_bars: number
  profit_factor: number
  buy_hold_return: number
}

interface BacktestResult {
  metrics: Metrics
  trades: Trade[]
}

export default function BacktestPanel() {
  const [selectedCoin, setSelectedCoin] = useState('BTC')
  const [selectedStrategy, setSelectedStrategy] = useState('sma_cross')
  const [selectedTimeframe, setSelectedTimeframe] = useState('1d')
  const [periodDays, setPeriodDays] = useState(365)
  const [initialCapital, setInitialCapital] = useState(10000)
  const [commissionPct, setCommissionPct] = useState(0.1)
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>({})
  const [selectedModel, setSelectedModel] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false)

  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [llmAnalysis, setLlmAnalysis] = useState('')
  const [sentimentArticles, setSentimentArticles] = useState<any[]>([])
  const [drlInfo, setDrlInfo] = useState<any>(null)
  const [mlInfo, setMlInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const models = useChatStore((s) => s.models)

  const currentStrategy = BACKTEST_STRATEGIES.find((s) => s.id === selectedStrategy)!

  // Initialize strategy params when strategy changes
  useEffect(() => {
    const defaults: Record<string, number> = {}
    currentStrategy.params.forEach((p) => {
      defaults[p.key] = p.default
    })
    setStrategyParams(defaults)
  }, [selectedStrategy])

  // Auto-scroll results
  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight
    }
  }, [llmAnalysis])

  const updateParam = (key: string, value: number) => {
    setStrategyParams((prev) => ({ ...prev, [key]: value }))
  }

  const runBacktest = async () => {
    if (selectedStrategy === 'sentiment' && !selectedModel) {
      setError('Sentiment \uc804\ub7b5\uc740 AI \ubaa8\ub378 \uc120\ud0dd\uc774 \ud544\uc218\uc785\ub2c8\ub2e4. \ubaa8\ub378\uc744 \uc120\ud0dd\ud574\uc8fc\uc138\uc694.')
      return
    }

    setIsRunning(true)
    setProgress('')
    setResult(null)
    setLlmAnalysis('')
    setSentimentArticles([])
    setDrlInfo(null)
    setMlInfo(null)
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${BASE_URL}/api/crypto/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin: selectedCoin,
          strategy: selectedStrategy,
          timeframe: selectedTimeframe,
          period_days: periodDays,
          initial_capital: initialCapital,
          commission_pct: commissionPct,
          strategy_params: strategyParams,
          model: selectedModel,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setError(err.detail || `HTTP ${res.status}`)
        setIsRunning(false)
        return
      }

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
            if (data.type === 'progress') {
              setProgress(data.content)
            } else if (data.type === 'result') {
              setResult(data.content)
              setProgress('')
            } else if (data.type === 'token') {
              setLlmAnalysis((prev) => prev + data.content)
            } else if (data.type === 'sentiment_data') {
              setSentimentArticles(data.content.articles || [])
            } else if (data.type === 'drl_info') {
              setDrlInfo(data.content)
            } else if (data.type === 'ml_info') {
              setMlInfo(data.content)
            } else if (data.type === 'error') {
              setError(data.content)
            } else if (data.type === 'done') {
              // done
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Backtest failed')
      }
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  const stopBacktest = () => {
    abortRef.current?.abort()
    setIsRunning(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex-shrink-0 border-b border-slate-800 px-5 py-4 space-y-3">
        {/* Row 1: Coin */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Coin
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {COINS.map((coin) => {
              const isSelected = selectedCoin === coin.id
              return (
                <button
                  key={coin.id}
                  onClick={() => setSelectedCoin(coin.id)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'text-white shadow-lg'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: coin.color, boxShadow: `0 4px 12px ${coin.color}40` }
                      : undefined
                  }
                >
                  {coin.id}
                </button>
              )
            })}
          </div>
        </div>

        {/* Row 2: Strategy + Timeframe + Period */}
        <div className="flex gap-4 flex-wrap items-end">
          {/* Strategy dropdown */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Strategy
            </label>
            <button
              onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
              disabled={isRunning}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:border-slate-600 transition-colors min-w-[160px]"
            >
              <span>{currentStrategy.name}</span>
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {showStrategyDropdown && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[180px]">
                {BACKTEST_STRATEGIES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStrategy(s.id)
                      setShowStrategyDropdown(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                      selectedStrategy === s.id ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeframe */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Timeframe
            </label>
            <div className="flex gap-1">
              {BT_TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setSelectedTimeframe(tf.id)}
                  disabled={isRunning}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                    selectedTimeframe === tf.id
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Period
            </label>
            <div className="flex gap-1">
              {BT_PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodDays(p.id)}
                  disabled={isRunning}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                    periodDays === p.id
                      ? 'bg-angel-600/20 border-angel-500/50 text-angel-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Capital, Commission, Strategy Params */}
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Capital ($)
            </label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              disabled={isRunning}
              className="w-24 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-angel-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Fee (%)
            </label>
            <input
              type="number"
              value={commissionPct}
              onChange={(e) => setCommissionPct(Number(e.target.value))}
              disabled={isRunning}
              step={0.01}
              className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-angel-500"
            />
          </div>

          {/* Dynamic strategy params */}
          {currentStrategy.params.map((p) => (
            <div key={p.key}>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                {p.label}
              </label>
              <input
                type="number"
                value={strategyParams[p.key] ?? p.default}
                onChange={(e) => updateParam(p.key, Number(e.target.value))}
                disabled={isRunning}
                min={p.min}
                max={p.max}
                step={p.step || 1}
                className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-angel-500"
              />
            </div>
          ))}

          {/* Model selector (required for sentiment) */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              AI Analysis{selectedStrategy === 'sentiment' ? ' (Required)' : ''}
            </label>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={isRunning}
              className={`flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-300 hover:border-slate-600 transition-colors min-w-[140px] ${
                selectedStrategy === 'sentiment' && !selectedModel
                  ? 'border-amber-500/50'
                  : 'border-slate-700'
              }`}
            >
              <span className="truncate text-xs">{selectedModel || 'None'}</span>
              <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
            </button>
            {showModelDropdown && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[200px]">
                <button
                  onClick={() => {
                    setSelectedModel('')
                    setShowModelDropdown(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                    !selectedModel ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                >
                  None (metrics only)
                </button>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id)
                      setShowModelDropdown(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                      selectedModel === m.id ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {m.id}
                    <span className="text-xs text-slate-500 ml-2">{m.provider}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Run / Stop button */}
          <div className="ml-auto">
            {isRunning ? (
              <button
                onClick={stopBacktest}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Square size={14} />
                Stop
              </button>
            ) : (
              <button
                onClick={runBacktest}
                disabled={!selectedCoin}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Play size={14} />
                Run Backtest
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results area */}
      <div ref={resultRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Progress */}
        {isRunning && progress && (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">{progress}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Metrics cards */}
        {result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Total Return"
                value={`${result.metrics.total_return >= 0 ? '+' : ''}${result.metrics.total_return}%`}
                color={result.metrics.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCard
                label="Max Drawdown"
                value={`${result.metrics.mdd}%`}
                color="text-red-400"
              />
              <MetricCard
                label="Win Rate"
                value={`${result.metrics.win_rate}%`}
                color={result.metrics.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
              />
              <MetricCard
                label="Total Trades"
                value={`${result.metrics.total_trades}`}
                color="text-slate-200"
              />
              <MetricCard
                label="CAGR"
                value={`${result.metrics.cagr >= 0 ? '+' : ''}${result.metrics.cagr}%`}
                color={result.metrics.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCard
                label="Profit Factor"
                value={`${result.metrics.profit_factor}`}
                color={result.metrics.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricCard
                label="Avg Hold"
                value={`${result.metrics.avg_hold_bars} bars`}
                color="text-slate-200"
              />
              <MetricCard
                label="Buy & Hold"
                value={`${result.metrics.buy_hold_return >= 0 ? '+' : ''}${result.metrics.buy_hold_return}%`}
                color={result.metrics.buy_hold_return >= 0 ? 'text-blue-400' : 'text-red-400'}
              />
            </div>

            {/* DRL Training Info */}
            {drlInfo && (
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg px-4 py-3">
                <h3 className="text-sm font-medium text-purple-300 mb-2">AI Training Results</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-purple-300 font-bold">{drlInfo.q_table_size}</div>
                    <div className="text-slate-500">States Learned</div>
                  </div>
                  <div>
                    <div className="text-purple-300 font-bold">{drlInfo.final_reward?.toFixed(1)}</div>
                    <div className="text-slate-500">Final Reward</div>
                  </div>
                  <div>
                    <div className="text-purple-300 font-bold">{drlInfo.avg_reward_last50}</div>
                    <div className="text-slate-500">Avg Reward (Last 50)</div>
                  </div>
                  <div>
                    <div className="text-purple-300 font-bold">{drlInfo.best_reward?.toFixed(1)}</div>
                    <div className="text-slate-500">Best Episode</div>
                  </div>
                </div>
              </div>
            )}

            {/* ML Gradient Boosting Info */}
            {mlInfo && (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-4 py-3">
                <h3 className="text-sm font-medium text-cyan-300 mb-2 flex items-center gap-1.5">
                  <Brain size={14} />
                  ML Training Results
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <div>
                    <div className="text-cyan-300 font-bold">{mlInfo.train_accuracy}%</div>
                    <div className="text-slate-500">Train Accuracy</div>
                  </div>
                  <div>
                    <div className={`font-bold ${mlInfo.test_accuracy >= 50 ? 'text-cyan-300' : 'text-amber-400'}`}>
                      {mlInfo.test_accuracy}%
                    </div>
                    <div className="text-slate-500">Test Accuracy</div>
                  </div>
                  <div>
                    <div className="text-cyan-300 font-bold">{mlInfo.n_trees} x d{mlInfo.max_depth}</div>
                    <div className="text-slate-500">Trees x Depth</div>
                  </div>
                  <div>
                    <div className="text-cyan-300 font-bold">
                      {mlInfo.train_samples}/{mlInfo.test_samples}
                    </div>
                    <div className="text-slate-500">Train/Test Samples</div>
                  </div>
                </div>
                {/* Feature importance bar chart */}
                {mlInfo.top_features && mlInfo.top_features.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 mb-1.5">Top Features</div>
                    <div className="space-y-1">
                      {mlInfo.top_features.map((f: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="text-xs text-slate-400 w-28 truncate">{f.name}</div>
                          <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                              style={{ width: `${Math.min(f.importance * 100 / (mlInfo.top_features[0]?.importance || 1), 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-cyan-400 w-12 text-right">
                            {(f.importance * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trade history table */}
            {result.trades.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-2">
                  Trade History ({result.trades.length} trades)
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 text-slate-400">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Type</th>
                        <th className="text-left px-3 py-2 font-medium">Entry Date</th>
                        <th className="text-right px-3 py-2 font-medium">Entry Price</th>
                        <th className="text-left px-3 py-2 font-medium">Exit Date</th>
                        <th className="text-right px-3 py-2 font-medium">Exit Price</th>
                        <th className="text-right px-3 py-2 font-medium">P&L</th>
                        <th className="text-right px-3 py-2 font-medium">Bars</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((trade, idx) => (
                        <tr
                          key={idx}
                          className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-3 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5">
                            <span className="text-emerald-400 font-medium">{trade.type}</span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-300">{trade.entry_date}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">
                            ${trade.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-3 py-1.5 text-slate-300">{trade.exit_date}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">
                            ${trade.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-medium ${
                            trade.pnl_pct > 0 ? 'text-emerald-400' : trade.pnl_pct < 0 ? 'text-red-400' : 'text-slate-400'
                          }`}>
                            <span className="inline-flex items-center gap-0.5">
                              {trade.pnl_pct > 0 ? <ArrowUpRight size={10} /> : trade.pnl_pct < 0 ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                              {trade.pnl_pct > 0 ? '+' : ''}{trade.pnl_pct}%
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{trade.hold_bars}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sentiment News Articles */}
        {sentimentArticles.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">
              <Newspaper size={14} className="text-amber-400" />
              Current News ({sentimentArticles.length} articles)
            </h3>
            <div className="space-y-2">
              {sentimentArticles.map((article: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-800/30 border border-slate-700/50 rounded-lg px-4 py-3"
                >
                  <div className="text-sm font-medium text-slate-200">{article.title}</div>
                  {(article.source || article.date) && (
                    <div className="text-xs text-slate-500 mt-1">
                      {article.source}
                      {article.source && article.date && ' | '}
                      {article.date}
                    </div>
                  )}
                  {article.body && (
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{article.body}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LLM Analysis */}
        {llmAnalysis && (
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">AI Analysis</h3>
            <div className="prose prose-invert prose-sm max-w-none bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
              <div
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(llmAnalysis),
                }}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !result && !error && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            {'\ucf54\uc778\uacfc \uc804\ub7b5\uc744 \uc120\ud0dd\ud55c \ud6c4 Run Backtest \ubc84\ud2bc\uc744 \ub20c\ub7ec\uc8fc\uc138\uc694'}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-200 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-slate-100 mt-6 mb-3 border-b border-slate-700 pb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300">$2</li>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-angel-300 text-xs">$1</code>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}
