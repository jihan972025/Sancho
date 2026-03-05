import { MessageSquare, CandlestickChart, Bot, Network, Users, ScrollText } from 'lucide-react'
import { useFeatureStore, type FeatureId } from '../../stores/featureStore'

const features: { id: FeatureId; icon: typeof MessageSquare; label: string; description: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', description: 'AI 채팅 인터페이스' },
  { id: 'crypto', icon: CandlestickChart, label: 'Crypto Analysis', description: '암호화폐 분석 대시보드' },
  { id: 'scheduler', icon: Bot, label: 'Agent', description: 'AI 에이전트 & 스케줄러' },
  { id: 'ontology', icon: Network, label: 'Ontology Analysis', description: '코드 온톨로지 시각화' },
  { id: 'p2pchat', icon: Users, label: 'P2P Chat', description: 'P2P 채팅' },
  { id: 'logs', icon: ScrollText, label: 'Logs', description: '시스템 로그 뷰어' },
]

export default function FeatureManagementTab() {
  const { visibility, setVisible } = useFeatureStore()

  return (
    <div>
      <h3 className="text-lg font-medium text-white mb-1">기능 관리</h3>
      <p className="text-xs text-slate-400 mb-4">
        좌측 사이드바에 표시할 기능을 선택하세요. 비활성화된 기능은 사이드바에서 숨겨집니다.
      </p>

      <div className="space-y-2">
        {features.map((f) => {
          const Icon = f.icon
          const enabled = visibility[f.id] ?? true
          return (
            <div
              key={f.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                enabled
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-900/50 border-slate-800 opacity-60'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                enabled ? 'bg-angel-600/20 text-angel-400' : 'bg-slate-800 text-slate-500'
              }`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{f.label}</div>
                <div className="text-xs text-slate-400">{f.description}</div>
              </div>
              <button
                onClick={() => setVisible(f.id, !enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  enabled ? 'bg-angel-600' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  enabled ? 'left-5.5 translate-x-0' : 'left-0.5'
                }`}
                  style={{ left: enabled ? '22px' : '2px' }}
                />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
