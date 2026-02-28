import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import NodePalette from './AgentBuilder/NodePalette'
import WorkflowCanvas from './AgentBuilder/WorkflowCanvas'
import AgentConfig from './AgentBuilder/AgentConfig'
import { useWorkflowAgentStore } from '../../stores/workflowAgentStore'
import type { AgentWorkflow } from '../../types'

interface Props {
  agent: AgentWorkflow | null
  onBack: () => void
}

export default function AgentBuilder({ agent, onBack }: Props) {
  const { initNewAgent, loadAgent } = useWorkflowAgentStore()
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    if (agent) {
      loadAgent(agent)
    } else {
      initNewAgent()
    }
  }, [agent])

  return (
    <div className="h-full flex overflow-hidden relative">
      {/* Left: Service palette */}
      {leftOpen && <NodePalette onClose={() => setLeftOpen(false)} />}

      {/* Left toggle button (shown when closed) */}
      {!leftOpen && (
        <button
          onClick={() => setLeftOpen(true)}
          className="absolute left-1 top-1 z-10 p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50"
          title="Open palette"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* Center: Workflow canvas */}
      <WorkflowCanvas />

      {/* Right toggle button (shown when closed, positioned below zoom toolbar) */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute right-1 top-11 z-10 p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50"
          title="Open config"
        >
          <PanelRightOpen size={14} />
        </button>
      )}

      {/* Right: Agent config */}
      {rightOpen && <AgentConfig onBack={onBack} onClose={() => setRightOpen(false)} />}
    </div>
  )
}
