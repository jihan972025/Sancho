import { useState } from 'react'
import { Save, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import { useChatStore } from '../../stores/chatStore'
import { updateSettings, getModels } from '../../api/client'
import ProfileTab from './ProfileTab'
import LLMModelsTab from './LLMModelsTab'
import ChatAppTab from './ChatAppTab'
import ApiTab from './ApiTab'
import LanguageTab from './LanguageTab'
import VoiceAppTab from './VoiceAppTab'

type Tab = 'profile' | 'llm' | 'chatapp' | 'api' | 'voice' | 'language'

export default function SettingsPanel() {
  const { t } = useTranslation()
  const { config, setConfig } = useSettingsStore()
  const setModels = useChatStore((s) => s.setModels)
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Always read the latest config from the store to avoid stale closure
      const latestConfig = useSettingsStore.getState().config
      const updated = await updateSettings(latestConfig)
      setConfig(updated as any)
      const { models } = await getModels()
      setModels(models)
      const current = useChatStore.getState().selectedModel
      const ids = models.map((m: any) => m.id)
      if ((!current || !ids.includes(current)) && models.length > 0) {
        useChatStore.getState().setSelectedModel(models[0].id)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(`Failed to save: ${err}`)
    }
    setSaving(false)
  }

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: 'profile', labelKey: 'settings.profile' },
    { id: 'llm', labelKey: 'settings.llmModels' },
    { id: 'chatapp', labelKey: 'settings.chatApp' },
    { id: 'api', labelKey: 'settings.api' },
    { id: 'voice', labelKey: 'settings.voiceApp' },
    { id: 'language', labelKey: 'settings.languageTab' },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-slate-700 px-6 pt-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-angel-500 text-angel-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content - scrollable */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className={`${activeTab === 'llm' || activeTab === 'api' ? 'max-w-4xl' : 'max-w-2xl'} mx-auto`}>
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'llm' && <LLMModelsTab />}
          {activeTab === 'chatapp' && <ChatAppTab />}
          {activeTab === 'api' && <ApiTab />}
          {activeTab === 'voice' && <VoiceAppTab />}
          {activeTab === 'language' && <LanguageTab />}
        </div>
      </div>

      {/* Fixed save button - hidden on profile tab (has its own save) */}
      {activeTab !== 'profile' && activeTab !== 'voice' && (
        <div className="border-t border-slate-700 px-6 py-3">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              {saved ? <CheckCircle size={16} /> : <Save size={16} />}
              {saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.saveSettings')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
