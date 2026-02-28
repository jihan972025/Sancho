import { useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, PanelLeftClose } from 'lucide-react'
import { allServices, categoryLabels } from '../agentServiceDefs'
import type { DraggableServiceDef } from '../agentServiceDefs'
import { useTranslation } from 'react-i18next'

const categories = ['free', 'paid', 'exchange', 'chatapp'] as const

interface PaletteProps {
  onClose: () => void
}

export default function NodePalette({ onClose }: PaletteProps) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ko' ? 'ko' : 'en'
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState('')

  const toggle = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  const handleDragStart = (e: React.DragEvent, svc: DraggableServiceDef) => {
    e.dataTransfer.setData(
      'application/sancho-service',
      JSON.stringify({ serviceId: svc.id, serviceType: svc.category === 'chatapp' ? 'chatapp' : 'api' })
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const filtered = searchTerm
    ? allServices.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : null

  return (
    <div className="w-52 border-r border-slate-800 bg-slate-900/50 flex flex-col overflow-hidden shrink-0">
      {/* Search + close */}
      <div className="p-2 border-b border-slate-800 flex items-center gap-1">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
        />
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-slate-200 transition-colors shrink-0"
          title="Close palette"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Services list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered ? (
          <div className="space-y-0.5">
            {filtered.map((svc) => (
              <PaletteItem key={svc.id} svc={svc} onDragStart={handleDragStart} />
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-4">No results</p>
            )}
          </div>
        ) : (
          categories.map((cat) => {
            const items = allServices.filter((s) => s.category === cat)
            const isCollapsed = collapsed[cat]
            return (
              <div key={cat} className="mb-1">
                <button
                  onClick={() => toggle(cat)}
                  className="flex items-center gap-1 w-full px-1.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span>{categoryLabels[cat][lang]}</span>
                  <span className="text-slate-600 ml-auto">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5 mt-0.5">
                    {items.map((svc) => (
                      <PaletteItem key={svc.id} svc={svc} onDragStart={handleDragStart} />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function PaletteItem({
  svc,
  onDragStart,
}: {
  svc: DraggableServiceDef
  onDragStart: (e: React.DragEvent, svc: DraggableServiceDef) => void
}) {
  const Icon = svc.icon
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, svc)}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded border cursor-grab active:cursor-grabbing hover:brightness-125 transition-all ${svc.bgColor}`}
    >
      <GripVertical size={10} className="text-slate-600 shrink-0" />
      <Icon size={12} className={`${svc.color} shrink-0`} />
      <span className="text-xs text-slate-300 truncate">{svc.name}</span>
    </div>
  )
}
