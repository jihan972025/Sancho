import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
]

export default function LanguageTab() {
  const { t, i18n } = useTranslation()
  const { config, setConfig } = useSettingsStore()

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code)
    setConfig({ ...config, language: code })
  }

  const current = i18n.language

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-1">{t('settings.language')}</h2>
        <p className="text-sm text-slate-400">{t('settings.languageDesc')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map((lang) => {
          const selected = current === lang.code
          return (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                selected
                  ? 'border-angel-500 bg-angel-600/10'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <div>
                <span className="text-sm font-medium text-slate-200">{lang.native}</span>
                <span className="text-xs text-slate-500 ml-2">{lang.name}</span>
              </div>
              {selected && <Check size={16} className="text-angel-400 shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
