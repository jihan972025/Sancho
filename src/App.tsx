import { useEffect, useState } from 'react'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import ChatWindow from './components/Chat/ChatWindow'
import CryptoPanel from './components/Crypto/CryptoPanel'
import SchedulerPanel from './components/Scheduler/SchedulerPanel'
import SettingsPanel from './components/Settings/SettingsPanel'
import LogPanel from './components/Log/LogPanel'
import { healthCheck, getSettings, getModels, getUserProfile } from './api/client'
import OnboardingModal from './components/Onboarding/OnboardingModal'
import { useSettingsStore } from './stores/settingsStore'
import { useChatStore } from './stores/chatStore'
import { useMemoryStore } from './stores/memoryStore'
import { useConversationStore } from './stores/conversationStore'
import PatchNotification from './components/PatchNotification'

type Tab = 'chat' | 'crypto' | 'scheduler' | 'logs' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [backendReady, setBackendReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const setConfig = useSettingsStore((s) => s.setConfig)
  const setModels = useChatStore((s) => s.setModels)
  const addMessage = useChatStore((s) => s.addMessage)

  // Global chat app message listeners (works regardless of active tab)
  useEffect(() => {
    const wa = window.electronAPI?.whatsapp
    const tg = window.electronAPI?.telegram
    const mx = window.electronAPI?.matrix

    // Remove previous listeners (prevents duplicates in StrictMode)
    wa?.removeChatListeners()
    tg?.removeChatListeners()
    mx?.removeChatListeners()

    const handleMsg = (msg: { role: string; content: string; source: string }) => {
      useChatStore.getState().addMessage({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        source: msg.source as any,
      })
    }

    const handleTyping = (typing: boolean) => {
      useChatStore.getState().setStreaming(typing)
    }

    wa?.onChatMessage(handleMsg)
    wa?.onTyping(handleTyping)
    tg?.onChatMessage(handleMsg)
    tg?.onTyping(handleTyping)
    mx?.onChatMessage(handleMsg)
    mx?.onTyping(handleTyping)

    return () => {
      wa?.removeChatListeners()
      tg?.removeChatListeners()
      mx?.removeChatListeners()
    }
  }, [])

  useEffect(() => {
    let attempts = 0
    const checkBackend = async () => {
      try {
        await healthCheck()
        setBackendReady(true)
        // Load settings and models
        const settings = await getSettings()
        setConfig(settings)
        const { models } = await getModels()
        setModels(models)
        // Auto-select first available model if none selected
        const current = useChatStore.getState().selectedModel
        if (!current && models.length > 0) {
          useChatStore.getState().setSelectedModel(models[0].id)
        }
        // Load memories and conversations
        useMemoryStore.getState().fetchMemories()
        useConversationStore.getState().fetchConversations()
        // Check if onboarding is needed
        try {
          const profile = await getUserProfile()
          if (!profile.exists) setShowOnboarding(true)
        } catch {
          // Show onboarding if endpoint fails (e.g. first run)
          setShowOnboarding(true)
        }
      } catch {
        if (attempts < 30) {
          attempts++
          setTimeout(checkBackend, 1000)
        }
      }
    }
    checkBackend()
  }, [setConfig, setModels])

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false)
    // Reload settings to pick up language change
    try {
      const settings = await getSettings()
      setConfig(settings)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-screen bg-slate-900">
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
      <PatchNotification />
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header activeTab={activeTab} backendReady={backendReady} />
        <main className="flex-1 overflow-hidden">
          {!backendReady ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-angel-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-slate-400">Connecting to backend...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'chat' && <ChatWindow />}
              {activeTab === 'crypto' && <CryptoPanel />}
              {activeTab === 'scheduler' && <SchedulerPanel />}
              {activeTab === 'logs' && <LogPanel />}
              {activeTab === 'settings' && <SettingsPanel />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
