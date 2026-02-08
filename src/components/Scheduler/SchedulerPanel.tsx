import { useEffect, useState } from 'react'
import { Plus, Play, Pencil, Trash2, X, Eye, Clock, CalendarClock, AlertCircle, CheckCircle2, Globe, MessageSquare, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSchedulerStore } from '../../stores/schedulerStore'
import { useChatStore } from '../../stores/chatStore'
import type { ScheduledTask, TaskLog, NotifyApps } from '../../types'

const electronAPI = (window as any).electronAPI

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const DAY_I18N: Record<string, string> = {
  mon: 'scheduler.dayMon',
  tue: 'scheduler.dayTue',
  wed: 'scheduler.dayWed',
  thu: 'scheduler.dayThu',
  fri: 'scheduler.dayFri',
  sat: 'scheduler.daySat',
  sun: 'scheduler.daySun',
}

const TZ_I18N: Record<string, string> = {
  'Asia/Seoul': 'scheduler.tzSeoul',
  'Asia/Tokyo': 'scheduler.tzTokyo',
  'Asia/Shanghai': 'scheduler.tzShanghai',
  'Asia/Singapore': 'scheduler.tzSingapore',
  'Asia/Kolkata': 'scheduler.tzKolkata',
  'Asia/Dubai': 'scheduler.tzDubai',
  'Europe/London': 'scheduler.tzLondon',
  'Europe/Paris': 'scheduler.tzParis',
  'Europe/Berlin': 'scheduler.tzBerlin',
  'America/New_York': 'scheduler.tzNewYork',
  'America/Chicago': 'scheduler.tzChicago',
  'America/Denver': 'scheduler.tzDenver',
  'America/Los_Angeles': 'scheduler.tzLA',
  'Pacific/Auckland': 'scheduler.tzAuckland',
  'Australia/Sydney': 'scheduler.tzSydney',
  'UTC': 'scheduler.tzUTC',
}

const TZ_VALUES = [
  'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Pacific/Auckland',
  'Australia/Sydney', 'UTC',
]

type ChatAppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

interface FormData {
  name: string
  prompt: string
  model: string
  schedule_type: 'cron' | 'interval'
  cron_hour: number
  cron_minute: number
  cron_days: string[]
  interval_minutes: number
  timezone: string
  notify_apps: NotifyApps
}

const defaultForm: FormData = {
  name: '',
  prompt: '',
  model: '',
  schedule_type: 'cron',
  cron_hour: 9,
  cron_minute: 0,
  cron_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  interval_minutes: 60,
  timezone: 'Asia/Seoul',
  notify_apps: { whatsapp: false, telegram: false, matrix: false },
}

export default function SchedulerPanel() {
  const { t } = useTranslation()
  const { tasks, logs, loading, running, fetchTasks, fetchLogs, addTask, editTask, removeTask, toggle, runNow } =
    useSchedulerStore()
  const models = useChatStore((s) => s.models)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({ ...defaultForm })
  const [viewLog, setViewLog] = useState<TaskLog | null>(null)
  const [chatAppStatus, setChatAppStatus] = useState<{
    whatsapp: ChatAppStatus
    telegram: ChatAppStatus
    matrix: ChatAppStatus
  }>({ whatsapp: 'disconnected', telegram: 'disconnected', matrix: 'disconnected' })

  function formatSchedule(task: ScheduledTask): string {
    if (task.schedule_type === 'interval') {
      return t('scheduler.minuteInterval', { minutes: task.interval_minutes })
    }
    const h = String(task.cron_hour).padStart(2, '0')
    const m = String(task.cron_minute).padStart(2, '0')
    const days = task.cron_days.length === 7
      ? t('scheduler.everyDay')
      : task.cron_days.map((d) => t(DAY_I18N[d] || d)).join(',')
    const tzKey = TZ_I18N[task.timezone]
    const tzLabel = tzKey ? t(tzKey) : task.timezone || 'KST'
    const tzShort = tzLabel.split(' ')[0]
    return `${days} ${h}:${m} (${tzShort})`
  }

  function formatTime(iso: string | null): string {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    fetchTasks()
    fetchLogs()

    async function fetchChatAppStatuses() {
      if (!electronAPI) return
      try {
        const [wa, tg, mx] = await Promise.all([
          electronAPI.whatsapp.getStatus(),
          electronAPI.telegram.getStatus(),
          electronAPI.matrix.getStatus(),
        ])
        setChatAppStatus({ whatsapp: wa, telegram: tg, matrix: mx })
      } catch { /* ignore */ }
    }
    fetchChatAppStatuses()

    if (electronAPI) {
      electronAPI.whatsapp.onStatusUpdate((s: ChatAppStatus) =>
        setChatAppStatus((prev) => ({ ...prev, whatsapp: s }))
      )
      electronAPI.telegram.onStatusUpdate((s: ChatAppStatus) =>
        setChatAppStatus((prev) => ({ ...prev, telegram: s }))
      )
      electronAPI.matrix.onStatusUpdate((s: ChatAppStatus) =>
        setChatAppStatus((prev) => ({ ...prev, matrix: s }))
      )
    }
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...defaultForm })
    setShowForm(true)
  }

  const openEdit = (task: ScheduledTask) => {
    setEditingId(task.id)
    setForm({
      name: task.name,
      prompt: task.prompt,
      model: task.model,
      schedule_type: task.schedule_type,
      cron_hour: task.cron_hour,
      cron_minute: task.cron_minute,
      cron_days: [...task.cron_days],
      interval_minutes: task.interval_minutes,
      timezone: task.timezone || 'Asia/Seoul',
      notify_apps: task.notify_apps
        ? { ...task.notify_apps }
        : { whatsapp: false, telegram: false, matrix: false },
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    if (editingId) {
      await editTask(editingId, form)
    } else {
      await addTask(form)
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    await removeTask(id)
  }

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      cron_days: f.cron_days.includes(day)
        ? f.cron_days.filter((d) => d !== day)
        : [...f.cron_days, day],
    }))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">{t('scheduler.title')}</h2>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-angel-600 hover:bg-angel-700 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={16} />
            {t('scheduler.newTask')}
          </button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">
                {editingId ? t('scheduler.editTask') : t('scheduler.createTask')}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <input
              type="text"
              placeholder={t('scheduler.taskName')}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500"
            />

            <textarea
              placeholder={t('scheduler.prompt')}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 resize-none"
            />

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.model')}</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                >
                  <option value="">{t('scheduler.useDefaultModel')}</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.scheduleType')}</label>
                <select
                  value={form.schedule_type}
                  onChange={(e) => setForm((f) => ({ ...f, schedule_type: e.target.value as 'cron' | 'interval' }))}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                >
                  <option value="cron">{t('scheduler.fixedTime')}</option>
                  <option value="interval">{t('scheduler.interval')}</option>
                </select>
              </div>
            </div>

            {form.schedule_type === 'cron' ? (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.hour')}</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={form.cron_hour}
                      onChange={(e) => setForm((f) => ({ ...f, cron_hour: parseInt(e.target.value) || 0 }))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.minute')}</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={form.cron_minute}
                      onChange={(e) => setForm((f) => ({ ...f, cron_minute: parseInt(e.target.value) || 0 }))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                      <Globe size={11} />
                      {t('scheduler.timezone')}
                    </label>
                    <select
                      value={form.timezone}
                      onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                    >
                      {TZ_VALUES.map((tz) => (
                        <option key={tz} value={tz}>{t(TZ_I18N[tz])}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.days')}</label>
                  <div className="flex flex-wrap gap-1">
                    {DAY_KEYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`px-2 h-8 rounded text-xs font-medium transition-colors ${
                          form.cron_days.includes(d)
                            ? 'bg-angel-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {t(DAY_I18N[d])}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">{t('scheduler.intervalMinutes')}</label>
                <input
                  type="number"
                  min={1}
                  value={form.interval_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, interval_minutes: parseInt(e.target.value) || 1 }))}
                  className="w-32 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-angel-500"
                />
              </div>
            )}

            {/* Chat App send results */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                <Send size={11} />
                {t('scheduler.sendResults')}
              </label>
              <div className="flex gap-3">
                {([
                  { key: 'whatsapp' as const, label: 'WhatsApp', icon: '📱' },
                  { key: 'telegram' as const, label: 'Telegram', icon: '✈️' },
                  { key: 'matrix' as const, label: 'Matrix', icon: '🔗' },
                ] as const).map((app) => {
                  const connected = chatAppStatus[app.key] === 'connected'
                  const enabled = form.notify_apps[app.key]
                  return (
                    <div
                      key={app.key}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                        connected
                          ? enabled
                            ? 'border-angel-500 bg-angel-600/10'
                            : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                          : 'border-slate-700/50 bg-slate-900/50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-sm">{app.icon}</span>
                      <span className="text-xs text-slate-300">{app.label}</span>
                      <button
                        type="button"
                        disabled={!connected}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            notify_apps: { ...f.notify_apps, [app.key]: !f.notify_apps[app.key] },
                          }))
                        }
                        className={`relative w-8 h-[18px] rounded-full transition-colors ml-1 ${
                          !connected
                            ? 'bg-slate-700'
                            : enabled
                              ? 'bg-angel-600'
                              : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${
                            enabled && connected ? 'left-[16px]' : 'left-[2px]'
                          }`}
                        />
                      </button>
                      {!connected && (
                        <span className="text-[10px] text-slate-500">{t('scheduler.notConnected')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
              >
                {t('scheduler.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim() || !form.prompt.trim()}
                className="px-4 py-1.5 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                {editingId ? t('scheduler.edit') : t('scheduler.create')}
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        {loading && tasks.length === 0 ? (
          <div className="text-center text-slate-500 py-8">{t('scheduler.loading')}</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <CalendarClock size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">{t('scheduler.noTasks')}</p>
            <p className="text-slate-500 text-xs mt-1">{t('scheduler.noTasksHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm text-slate-200 truncate">{task.name}</span>
                    {task.model && (
                      <span className="text-xs text-slate-500 shrink-0">{task.model}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle */}
                    <button
                      onClick={() => toggle(task.id)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        task.enabled ? 'bg-angel-600' : 'bg-slate-600'
                      }`}
                      title={task.enabled ? t('scheduler.disable') : t('scheduler.enable')}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          task.enabled ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                    {/* Run now */}
                    <button
                      onClick={() => runNow(task.id)}
                      disabled={!!running[task.id]}
                      className="p-1.5 text-slate-400 hover:text-green-400 disabled:opacity-50 transition-colors"
                      title={t('scheduler.runNow')}
                    >
                      {running[task.id] ? (
                        <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => openEdit(task)}
                      className="p-1.5 text-slate-400 hover:text-angel-400 transition-colors"
                      title={t('scheduler.edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                      title={t('scheduler.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatSchedule(task)}
                  </span>
                  {task.notify_apps && (task.notify_apps.whatsapp || task.notify_apps.telegram || task.notify_apps.matrix) && (
                    <span className="flex items-center gap-0.5 text-angel-400" title={t('scheduler.sendResults')}>
                      <Send size={11} />
                      {task.notify_apps.whatsapp && <span>WA</span>}
                      {task.notify_apps.telegram && <span>TG</span>}
                      {task.notify_apps.matrix && <span>MX</span>}
                    </span>
                  )}
                  {task.last_run && (
                    <span>
                      {t('scheduler.lastRun')} {formatTime(task.last_run)}{' '}
                      {task.last_result?.startsWith('[ERROR]') ? (
                        <AlertCircle size={12} className="inline text-red-400" />
                      ) : (
                        <CheckCircle2 size={12} className="inline text-green-400" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">{t('scheduler.recentLogs')}</h3>
            <div className="space-y-1">
              {logs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {log.status === 'success' ? (
                      <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    ) : (
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                    )}
                    <span className="text-slate-300 truncate">{log.task_name}</span>
                    <span className="text-slate-500 shrink-0">{formatTime(log.executed_at)}</span>
                  </div>
                  <button
                    onClick={() => setViewLog(log)}
                    className="text-slate-400 hover:text-angel-400 shrink-0 ml-2 transition-colors"
                    title={t('scheduler.viewResult')}
                  >
                    <Eye size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {viewLog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-medium text-slate-200">{viewLog.task_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatTime(viewLog.executed_at)} ·{' '}
                  <span className={viewLog.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                    {viewLog.status === 'success' ? t('scheduler.success') : t('scheduler.failure')}
                  </span>
                </p>
              </div>
              <button onClick={() => setViewLog(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words">{viewLog.result}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
