import { useEffect, useRef, useState, useCallback } from 'react'
import { Trash2, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { streamLogs, clearLogs } from '../../api/client'

interface LogEntry {
  timestamp: string
  level: string
  name: string
  message: string
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-slate-500',
  INFO: 'text-green-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
  CRITICAL: 'text-red-500',
}

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR']

export default function LogPanel() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeLevel, setActiveLevel] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const { stop } = streamLogs(
      (entry) => setLogs((prev) => [...prev, entry]),
      (err) => console.error('Log stream error:', err),
    )
    return () => stop()
  }, [])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAutoScroll(true)
    }
  }

  const handleClear = async () => {
    try {
      await clearLogs()
      setLogs([])
    } catch {
      // ignore
    }
  }

  const filtered = activeLevel ? logs.filter((l) => l.level === activeLevel) : logs

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0">
        <h2 className="text-sm font-medium text-slate-200 mr-2">{t('logs.title')}</h2>
        <div className="flex gap-1">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setActiveLevel(activeLevel === level ? null : level)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                activeLevel === level
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleClear}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={t('logs.clear')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5 relative"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            {t('logs.noLogs')}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="text-slate-500">
                {entry.timestamp.split('T')[1]?.slice(0, 12) || entry.timestamp}
              </span>{' '}
              <span className={LEVEL_COLORS[entry.level] || 'text-slate-300'}>
                [{entry.level}]
              </span>{' '}
              <span className="text-slate-400">{entry.name}:</span>{' '}
              <span className="text-slate-200">{entry.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 p-2 rounded-full bg-slate-700 text-white shadow-lg hover:bg-slate-600 transition-colors"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  )
}
