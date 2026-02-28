import { useState } from 'react'
import { ArrowLeft, Play, Save, Loader2, PanelRightClose } from 'lucide-react'
import { useWorkflowAgentStore } from '../../../stores/workflowAgentStore'
import { useChatStore } from '../../../stores/chatStore'
import { useTranslation } from 'react-i18next'

const TIMEZONES = [
  { value: 'Asia/Seoul', key: 'tzSeoul' },
  { value: 'Asia/Tokyo', key: 'tzTokyo' },
  { value: 'Asia/Shanghai', key: 'tzShanghai' },
  { value: 'Asia/Singapore', key: 'tzSingapore' },
  { value: 'Asia/Kolkata', key: 'tzKolkata' },
  { value: 'Asia/Dubai', key: 'tzDubai' },
  { value: 'Europe/London', key: 'tzLondon' },
  { value: 'Europe/Paris', key: 'tzParis' },
  { value: 'Europe/Berlin', key: 'tzBerlin' },
  { value: 'America/New_York', key: 'tzNewYork' },
  { value: 'America/Chicago', key: 'tzChicago' },
  { value: 'America/Denver', key: 'tzDenver' },
  { value: 'America/Los_Angeles', key: 'tzLA' },
  { value: 'Pacific/Auckland', key: 'tzAuckland' },
  { value: 'Australia/Sydney', key: 'tzSydney' },
  { value: 'UTC', key: 'tzUTC' },
]

const DAYS = [
  { id: 'mon', key: 'dayMon', short: 'M' },
  { id: 'tue', key: 'dayTue', short: 'T' },
  { id: 'wed', key: 'dayWed', short: 'W' },
  { id: 'thu', key: 'dayThu', short: 'T' },
  { id: 'fri', key: 'dayFri', short: 'F' },
  { id: 'sat', key: 'daySat', short: 'S' },
  { id: 'sun', key: 'daySun', short: 'S' },
]

interface Props {
  onBack: () => void
  onClose: () => void
}

export default function AgentConfig({ onBack, onClose }: Props) {
  const { t } = useTranslation()
  const models = useChatStore((s) => s.models)
  const {
    editingAgent, isDirty,
    setAgentName, setAgentModel, setSchedule,
    saveAgent, runAgentNow,
  } = useWorkflowAgentStore()

  const sch = editingAgent.schedule
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAgent()
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    // Auto-assign name if empty
    const store = useWorkflowAgentStore.getState()
    if (!store.editingAgent.name.trim()) {
      const autoName = `Agent ${new Date().toLocaleString()}`
      setAgentName(autoName)
    }

    // Save first if not yet saved
    if (!useWorkflowAgentStore.getState().editingAgent.id) {
      setSaving(true)
      try {
        await saveAgent()
      } finally {
        setSaving(false)
      }
    }

    const id = useWorkflowAgentStore.getState().editingAgent.id
    if (id) {
      setTesting(true)
      try {
        await runAgentNow(id)
      } finally {
        setTesting(false)
      }
    }
  }

  const toggleDay = (day: string) => {
    const days = sch.cron_days.includes(day)
      ? sch.cron_days.filter((d) => d !== day)
      : [...sch.cron_days, day]
    setSchedule({ cron_days: days })
  }

  const inputClass = 'w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="w-64 border-l border-slate-800 bg-slate-900/50 flex flex-col overflow-hidden shrink-0">
      {/* Close button */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-medium text-slate-400">{t('agent.config')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-slate-200 transition-colors"
          title="Close config"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pt-1 space-y-3">
        {/* Agent name */}
        <div>
          <label className={labelClass}>{t('agent.agentName')}</label>
          <input
            type="text"
            value={editingAgent.name}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="My Agent..."
            className={inputClass}
          />
        </div>

        {/* Model */}
        <div>
          <label className={labelClass}>{t('scheduler.model')}</label>
          <select
            value={editingAgent.model}
            onChange={(e) => setAgentModel(e.target.value)}
            className={inputClass}
          >
            <option value="">{t('scheduler.useDefaultModel')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
        </div>

        {/* Execution type */}
        <div>
          <label className={labelClass}>{t('agent.executionType')}</label>
          <div className="flex gap-1">
            <button
              onClick={() => setSchedule({ execution_type: 'recurring' })}
              className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                sch.execution_type === 'recurring'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {t('agent.recurring')}
            </button>
            <button
              onClick={() => setSchedule({ execution_type: 'onetime' })}
              className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                sch.execution_type === 'onetime'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {t('agent.onetime')}
            </button>
          </div>
        </div>

        {/* Schedule settings based on execution type */}
        {sch.execution_type === 'recurring' && (
          <>
            {/* Schedule type */}
            <div>
              <label className={labelClass}>{t('scheduler.scheduleType')}</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setSchedule({ schedule_type: 'cron' })}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    sch.schedule_type === 'cron'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t('scheduler.fixedTime')}
                </button>
                <button
                  onClick={() => setSchedule({ schedule_type: 'interval' })}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    sch.schedule_type === 'interval'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t('scheduler.interval')}
                </button>
              </div>
            </div>

            {sch.schedule_type === 'cron' ? (
              <>
                {/* Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>{t('scheduler.hour')}</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={sch.cron_hour}
                      onChange={(e) => setSchedule({ cron_hour: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('scheduler.minute')}</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={sch.cron_minute}
                      onChange={(e) => setSchedule({ cron_minute: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Days */}
                <div>
                  <label className={labelClass}>{t('scheduler.days')}</label>
                  <div className="flex gap-1">
                    {DAYS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => toggleDay(d.id)}
                        className={`w-7 h-7 text-[10px] rounded transition-colors ${
                          sch.cron_days.includes(d.id)
                            ? 'bg-angel-600 text-white'
                            : 'bg-slate-800 text-slate-500 hover:text-white'
                        }`}
                        title={t(`scheduler.${d.key}`)}
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timezone */}
                <div>
                  <label className={labelClass}>{t('scheduler.timezone')}</label>
                  <select
                    value={sch.timezone}
                    onChange={(e) => setSchedule({ timezone: e.target.value })}
                    className={inputClass}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {t(`scheduler.${tz.key}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              /* Interval */
              <div>
                <label className={labelClass}>{t('scheduler.intervalMinutes')}</label>
                <input
                  type="number"
                  min={1}
                  value={sch.interval_minutes}
                  onChange={(e) => setSchedule({ interval_minutes: parseInt(e.target.value) || 60 })}
                  className={inputClass}
                />
              </div>
            )}
          </>
        )}

        {sch.execution_type === 'onetime' && (
          <>
            {/* Execute immediately toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">{t('agent.executeImmediately')}</label>
              <button
                onClick={() => setSchedule({ execute_immediately: !sch.execute_immediately, start_time: null })}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  sch.execute_immediately ? 'bg-angel-600' : 'bg-slate-700'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  sch.execute_immediately ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Start time (if not immediate) */}
            {!sch.execute_immediately && (
              <div>
                <label className={labelClass}>{t('agent.startTime')}</label>
                <input
                  type="datetime-local"
                  value={sch.start_time || ''}
                  onChange={(e) => setSchedule({ start_time: e.target.value || null })}
                  className={inputClass}
                />
              </div>
            )}
          </>
        )}

      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {/* Test run */}
        <button
          onClick={handleTest}
          disabled={testing || editingAgent.nodes.length === 0}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/30 disabled:text-green-400/50 text-white text-xs rounded transition-colors"
        >
          {testing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          {t('agent.testRun')}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !editingAgent.name.trim()}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-angel-600 hover:bg-angel-700 disabled:bg-angel-600/30 disabled:text-angel-400/50 text-white text-xs rounded transition-colors"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          {t('agent.save')}
        </button>

        {/* Back to list */}
        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
        >
          <ArrowLeft size={12} />
          {t('agent.backToList')}
        </button>
      </div>
    </div>
  )
}
