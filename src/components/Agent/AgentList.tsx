import { useEffect, useState } from 'react'
import { Plus, Play, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Clock, CheckCircle2, XCircle, Eye } from 'lucide-react'
import { useWorkflowAgentStore } from '../../stores/workflowAgentStore'
import type { AgentWorkflow, AgentLog } from '../../types'
import { useTranslation } from 'react-i18next'

interface Props {
  onEdit: (agent: AgentWorkflow) => void
  onCreateNew: () => void
}

export default function AgentList({ onEdit, onCreateNew }: Props) {
  const { t } = useTranslation()
  const { agents, logs, loading, running, fetchAgents, fetchLogs, removeAgent, toggleAgentEnabled, runAgentNow } = useWorkflowAgentStore()
  const [viewLog, setViewLog] = useState<AgentLog | null>(null)

  useEffect(() => {
    fetchAgents()
    fetchLogs()
  }, [])

  const formatSchedule = (agent: AgentWorkflow) => {
    const sch = agent.schedule
    if (sch.execution_type === 'onetime') {
      if (sch.execute_immediately) return t('agent.executeImmediately')
      if (sch.start_time) return new Date(sch.start_time).toLocaleString()
      return t('agent.onetime')
    }
    if (sch.schedule_type === 'interval') {
      return t('scheduler.minuteInterval', { minutes: sch.interval_minutes })
    }
    const days = sch.cron_days.length === 7 ? t('scheduler.everyDay') : sch.cron_days.join(',')
    const tz = sch.timezone.split('/').pop() || sch.timezone
    return `${days} ${String(sch.cron_hour).padStart(2, '0')}:${String(sch.cron_minute).padStart(2, '0')} (${tz})`
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">{t('agent.agentList')}</h2>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-angel-600 hover:bg-angel-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          {t('agent.newAgent')}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <p className="text-sm">{t('agent.noAgents')}</p>
          <p className="text-xs mt-1">{t('agent.noAgentsHint')}</p>
        </div>
      )}

      {/* Agent cards */}
      {!loading && agents.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {agents.map((agent) => {
            const isRunning = running[agent.id]
            return (
              <div
                key={agent.id}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-2"
              >
                {/* Top row: name + actions */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200 truncate min-w-0">{agent.name || 'Untitled'}</span>
                  <div className="flex items-center gap-1">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleAgentEnabled(agent.id)}
                      className="p-1.5 rounded hover:bg-slate-700/50 transition-colors"
                      title={agent.enabled ? t('scheduler.disable') : t('scheduler.enable')}
                    >
                      {agent.enabled ? (
                        <ToggleRight size={18} className="text-green-400" />
                      ) : (
                        <ToggleLeft size={18} className="text-slate-500" />
                      )}
                    </button>
                    {/* Run now */}
                    <button
                      onClick={() => runAgentNow(agent.id)}
                      disabled={isRunning}
                      className="p-1.5 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                      title={t('scheduler.runNow')}
                    >
                      {isRunning ? (
                        <Loader2 size={14} className="animate-spin text-angel-400" />
                      ) : (
                        <Play size={14} className="text-green-400" />
                      )}
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => onEdit(agent)}
                      className="p-1.5 rounded hover:bg-slate-700/50 transition-colors"
                      title={t('scheduler.edit')}
                    >
                      <Pencil size={14} className="text-slate-400" />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => removeAgent(agent.id)}
                      className="p-1.5 rounded hover:bg-slate-700/50 transition-colors"
                      title={t('scheduler.delete')}
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Bottom row: schedule + tag */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock size={11} />
                    <span>{formatSchedule(agent)}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    agent.schedule.execution_type === 'recurring'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {agent.schedule.execution_type === 'recurring' ? t('agent.recurring') : t('agent.onetime')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent logs */}
      {logs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">{t('agent.recentLogs')}</h3>
          <div className="space-y-1">
            {logs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between text-xs bg-slate-800/30 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {log.status === 'success' ? (
                    <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                  ) : (
                    <XCircle size={12} className="text-red-400 shrink-0" />
                  )}
                  <span className="text-slate-300 truncate">{log.agent_name}</span>
                  <span className="text-slate-600">{new Date(log.executed_at).toLocaleString()}</span>
                </div>
                <button
                  onClick={() => setViewLog(log)}
                  className="text-slate-400 hover:text-white shrink-0"
                  title={t('scheduler.viewResult')}
                >
                  <Eye size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log detail modal */}
      {viewLog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewLog(null)}>
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-medium text-slate-200">{viewLog.agent_name}</h3>
                <p className="text-xs text-slate-500">{new Date(viewLog.executed_at).toLocaleString()}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${
                viewLog.status === 'success' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
              }`}>
                {viewLog.status === 'success' ? t('scheduler.success') : t('scheduler.failure')}
              </span>
            </div>
            <div className="p-4 overflow-y-auto">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{viewLog.result}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
