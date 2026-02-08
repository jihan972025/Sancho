import { Circle, Globe } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

interface Props {
  activeTab: string
  backendReady: boolean
}

const tabNames: Record<string, string> = {
  chat: 'Chat',
  scheduler: 'Scheduler',
  settings: 'Settings',
}

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語',
  zh: '简体中文',
  'zh-TW': '繁體中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  id: 'Indonesia',
  tr: 'Türkçe',
}

export default function Header({ activeTab, backendReady }: Props) {
  const language = useSettingsStore((s) => s.config.language)

  return (
    <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-slate-200">
          {tabNames[activeTab] || activeTab}
        </h1>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Globe size={12} className="text-angel-400" />
          <span>{LANG_LABELS[language] || language}</span>
        </div>
        <div className="flex items-center gap-2">
          <Circle
            size={8}
            className={backendReady ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}
          />
          {backendReady ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </header>
  )
}
