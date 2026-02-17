import { useState, useEffect, useRef } from 'react'
import { Search, X, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CoinInfo {
  id: string
  name: string
  price?: number
  volume_24h?: number
  color: string
}

interface CoinSearchPopupProps {
  coins: CoinInfo[]
  selectedCoin: string
  onSelect: (coinId: string) => void
  onClose: () => void
  disabled?: boolean
}

const POPULAR_COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT']

function formatKrw(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}B`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}M`
  return v.toLocaleString()
}

export default function CoinSearchPopup({
  coins,
  selectedCoin,
  onSelect,
  onClose,
  disabled,
}: CoinSearchPopupProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = query.trim()
    ? coins.filter(
        (c) =>
          c.id.toLowerCase().includes(query.toLowerCase()) ||
          c.name.toLowerCase().includes(query.toLowerCase()),
      )
    : coins

  const popularAvailable = POPULAR_COINS.filter((pid) =>
    coins.some((c) => c.id === pid),
  )

  const handleSelect = (coinId: string) => {
    if (!disabled) {
      onSelect(coinId)
      onClose()
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[420px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="font-semibold text-sm text-slate-200">
            {t('crypto.searchCoin')}
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('crypto.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Popular coins */}
        {!query && popularAvailable.length > 0 && (
          <div className="px-4 pb-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
              {t('crypto.popular')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {popularAvailable.map((pid) => {
                const c = coins.find((x) => x.id === pid)
                if (!c) return null
                const isSelected = selectedCoin === pid
                return (
                  <button
                    key={pid}
                    onClick={() => handleSelect(pid)}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'text-white ring-1 ring-white/30'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600/50'
                    }`}
                    style={
                      isSelected
                        ? { backgroundColor: c.color, boxShadow: `0 2px 8px ${c.color}40` }
                        : undefined
                    }
                  >
                    {pid}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Coin list */}
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              {t('crypto.noCoinResults')}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((c) => {
                const isSelected = selectedCoin === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c.id)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                        : 'hover:bg-slate-700/50 text-slate-300'
                    }`}
                  >
                    {/* Color dot */}
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    {/* Coin ID */}
                    <span className="font-semibold w-14 text-left">{c.id}</span>
                    {/* Name */}
                    <span className="text-slate-500 text-xs truncate flex-1 text-left">
                      {c.name !== c.id ? c.name : ''}
                    </span>
                    {/* Price */}
                    {c.price != null && c.price > 0 && (
                      <span className="text-xs text-slate-400 tabular-nums">
                        ₩{c.price.toLocaleString()}
                      </span>
                    )}
                    {/* Volume */}
                    {c.volume_24h != null && c.volume_24h > 0 && (
                      <span className="text-[10px] text-slate-600 tabular-nums w-16 text-right flex items-center justify-end gap-0.5">
                        <TrendingUp size={9} />
                        {formatKrw(c.volume_24h)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
