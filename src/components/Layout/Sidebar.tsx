import { MessageSquare, CandlestickChart, Bot, Users, Settings, ScrollText, Network } from 'lucide-react'
import { useFeatureStore } from '../../stores/featureStore'

interface Props {
  activeTab: string
  onTabChange: (tab: any) => void
}

const tabs = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'crypto', icon: CandlestickChart, label: 'Crypto Analysis' },
  { id: 'scheduler', icon: Bot, label: 'Agent' },
  { id: 'ontology', icon: Network, label: 'Ontology' },
  { id: 'p2pchat', icon: Users, label: 'P2P Chat' },
  { id: 'logs', icon: ScrollText, label: 'Logs' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar({ activeTab, onTabChange }: Props) {
  const visibility = useFeatureStore((s) => s.visibility)

  const isVisible = (id: string) => {
    if (id === 'settings') return true
    return visibility[id as keyof typeof visibility] ?? true
  }

  return (
    <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
      {tabs.filter((tab) => isVisible(tab.id)).map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-angel-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={tab.label}
          >
            <Icon size={20} />
          </button>
        )
      })}
    </div>
  )
}
