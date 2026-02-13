import { useState, useRef, useEffect } from 'react'
import { Play, Square, Loader2, ChevronDown, Check } from 'lucide-react'
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

interface StrategyDef {
  id: string
  name: string
  short: string
}

interface TimeframeDef {
  id: string
  label: string
}

const TIMEFRAMES: TimeframeDef[] = [
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: 'Daily' },
  { id: '1w', label: 'Weekly' },
  { id: '1M', label: 'Monthly' },
]

const STRATEGIES: StrategyDef[] = [
  { id: 'trend', name: '추세(Trend) 분석', short: '추세' },
  { id: 'support_resistance', name: '지지선/저항선', short: '지지/저항' },
  { id: 'candlestick', name: '캔들스틱 패턴', short: '캔들' },
  { id: 'indicators', name: '보조 지표 (RSI/MACD/BB)', short: '보조지표' },
  { id: 'chart_patterns', name: '차트 패턴', short: '차트패턴' },
  { id: 'divergence', name: '다이버전스', short: '다이버전스' },
  { id: 'multi_timeframe', name: '멀티 타임프레임', short: 'MTF' },
]

export default function CryptoPanel() {
  const [selectedCoin, setSelectedCoin] = useState<string>('BTC')
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(STRATEGIES.map((s) => s.id))
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const resultRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const models = useChatStore((s) => s.models)
  const selectedModel = useChatStore((s) => s.selectedModel)
  const setSelectedModel = useChatStore((s) => s.setSelectedModel)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight
    }
  }, [result])

  const toggleStrategy = (id: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedStrategies.length === STRATEGIES.length) {
      setSelectedStrategies([])
    } else {
      setSelectedStrategies(STRATEGIES.map((s) => s.id))
    }
  }

  const toggleTimeframe = (id: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const startAnalysis = async () => {
    if (!selectedCoin || selectedStrategies.length === 0 || selectedTimeframes.length === 0 || !selectedModel) return

    setIsAnalyzing(true)
    setResult('')
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${BASE_URL}/api/crypto/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin: selectedCoin,
          strategies: selectedStrategies,
          timeframes: selectedTimeframes,
          model: selectedModel,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        setError(err.detail || `HTTP ${res.status}`)
        setIsAnalyzing(false)
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
            if (data.type === 'token') {
              setResult((prev) => prev + data.content)
            } else if (data.type === 'done') {
              // done
            } else if (data.type === 'error') {
              setError(data.content)
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Analysis failed')
      }
    } finally {
      setIsAnalyzing(false)
      abortRef.current = null
    }
  }

  const stopAnalysis = () => {
    abortRef.current?.abort()
    setIsAnalyzing(false)
  }

  const coinData = COINS.find((c) => c.id === selectedCoin)

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Top control bar */}
      <div className="flex-shrink-0 border-b border-slate-800 px-5 py-4 space-y-4">
        {/* Coin selection */}
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
                  disabled={isAnalyzing}
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

        {/* Strategy selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Strategies
            </label>
            <button
              onClick={selectAll}
              disabled={isAnalyzing}
              className="text-xs text-angel-400 hover:text-angel-300 transition-colors"
            >
              {selectedStrategies.length === STRATEGIES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STRATEGIES.map((strategy) => {
              const isSelected = selectedStrategies.includes(strategy.id)
              return (
                <button
                  key={strategy.id}
                  onClick={() => toggleStrategy(strategy.id)}
                  disabled={isAnalyzing}
                  title={strategy.name}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    isSelected
                      ? 'bg-angel-600/20 border-angel-500/50 text-angel-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {isSelected && <Check size={10} className="inline mr-1 -mt-0.5" />}
                  {strategy.short}
                </button>
              )
            })}
          </div>
        </div>

        {/* Timeframe selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Timeframe
          </label>
          <div className="flex gap-1.5">
            {TIMEFRAMES.map((tf) => {
              const isSelected = selectedTimeframes.includes(tf.id)
              return (
                <button
                  key={tf.id}
                  onClick={() => toggleTimeframe(tf.id)}
                  disabled={isAnalyzing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {tf.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Model + Analyze button */}
        <div className="flex items-center gap-3">
          {/* Model selector */}
          <div className="relative flex-1 max-w-xs">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={isAnalyzing}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:border-slate-600 transition-colors"
            >
              <span className="truncate">{selectedModel || 'Select model...'}</span>
              <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
            </button>
            {showModelDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id)
                      setShowModelDropdown(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${
                      selectedModel === m.id ? 'text-angel-400' : 'text-slate-300'
                    }`}
                  >
                    {m.id}
                    <span className="text-xs text-slate-500 ml-2">{m.provider}</span>
                  </button>
                ))}
                {models.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500">No models available</div>
                )}
              </div>
            )}
          </div>

          {/* Analyze / Stop button */}
          {isAnalyzing ? (
            <button
              onClick={stopAnalysis}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              onClick={startAnalysis}
              disabled={!selectedCoin || selectedStrategies.length === 0 || selectedTimeframes.length === 0 || !selectedModel}
              className="flex items-center gap-2 px-5 py-2 bg-angel-600 hover:bg-angel-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Play size={14} />
              Analyze
            </button>
          )}
        </div>
      </div>

      {/* Result area */}
      <div ref={resultRef} className="flex-1 overflow-y-auto px-5 py-4">
        {isAnalyzing && !result && (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">
              {coinData?.name} ({selectedCoin}) 데이터 수집 및 분석 중...
            </span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="prose prose-invert prose-sm max-w-none">
            <div
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(result),
              }}
            />
          </div>
        )}

        {!isAnalyzing && !result && !error && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            코인과 전략을 선택한 후 Analyze 버튼을 눌러주세요
          </div>
        )}
      </div>
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
