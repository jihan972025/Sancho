import { MessageSquare, CalendarClock, Settings, ScrollText } from 'lucide-react'

interface Props {
  activeTab: string
  onTabChange: (tab: any) => void
}

const tabs = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'scheduler', icon: CalendarClock, label: 'Scheduler' },
  { id: 'logs', icon: ScrollText, label: 'Logs' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar({ activeTab, onTabChange }: Props) {
  return (
    <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2">
      <img src="./logo.svg" alt="Sancho" className="w-10 h-10 mb-4 rounded" />
      {tabs.map((tab) => {
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
