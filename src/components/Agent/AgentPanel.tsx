import { useState } from 'react'
import { List, Wrench } from 'lucide-react'
import AgentList from './AgentList'
import AgentBuilder from './AgentBuilder'
import type { AgentWorkflow } from '../../types'
import { useTranslation } from 'react-i18next'

export default function AgentPanel() {
  const { t } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'builder'>('list')
  const [editingAgent, setEditingAgent] = useState<AgentWorkflow | null>(null)

  const handleEdit = (agent: AgentWorkflow) => {
    setEditingAgent(agent)
    setActiveSubTab('builder')
  }

  const handleCreateNew = () => {
    setEditingAgent(null)
    setActiveSubTab('builder')
  }

  const handleBackToList = () => {
    setEditingAgent(null)
    setActiveSubTab('list')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-slate-800">
        <button
          onClick={() => setActiveSubTab('list')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === 'list'
              ? 'bg-angel-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <List size={14} />
          {t('agent.agentList')}
        </button>
        <button
          onClick={handleCreateNew}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === 'builder'
              ? 'bg-angel-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Wrench size={14} />
          {t('agent.agentBuilder')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'list' ? (
          <AgentList onEdit={handleEdit} onCreateNew={handleCreateNew} />
        ) : (
          <AgentBuilder agent={editingAgent} onBack={handleBackToList} />
        )}
      </div>
    </div>
  )
}
