import { useState } from 'react'
import { Eye, EyeOff, X, Plus, Monitor, ChevronRight } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

interface ProviderDef {
  key: string
  name: string
  label: string
  abbr: string
  color: string
  placeholder: string
  isLocal?: boolean
}

const providers: ProviderDef[] = [
  { key: 'openai_api_key', name: 'openai', label: 'OpenAI', abbr: 'OAI', color: '#10a37f', placeholder: 'sk-...' },
  { key: 'anthropic_api_key', name: 'anthropic', label: 'Anthropic', abbr: 'CL', color: '#d97757', placeholder: 'sk-ant-...' },
  { key: 'gemini_api_key', name: 'gemini', label: 'Google Gemini', abbr: 'GE', color: '#4285f4', placeholder: 'AI...' },
  { key: 'zhipuai_api_key', name: 'zhipuai', label: 'ZhipuAI', abbr: 'ZP', color: '#6366f1', placeholder: '...' },
  { key: 'deepseek_api_key', name: 'deepseek', label: 'DeepSeek', abbr: 'DS', color: '#0ea5e9', placeholder: 'sk-...' },
  { key: 'grok_api_key', name: 'grok', label: 'Grok (xAI)', abbr: 'GK', color: '#f43f5e', placeholder: 'xai-...' },
  { key: 'mistral_api_key', name: 'mistral', label: 'Mistral', abbr: 'MI', color: '#f97316', placeholder: '...' },
  { key: 'perplexity_api_key', name: 'perplexity', label: 'Perplexity', abbr: 'PX', color: '#22d3ee', placeholder: 'pplx-...' },
  { key: 'qwen_api_key', name: 'qwen', label: 'Qwen (Alibaba)', abbr: 'QW', color: '#a855f7', placeholder: 'sk-...' },
  { key: 'llama_api_key', name: 'llama', label: 'LLaMA (Together)', abbr: 'LL', color: '#8b5cf6', placeholder: '...' },
  { key: 'github_api_key', name: 'github', label: 'GitHub Copilot', abbr: 'GH', color: '#6e7681', placeholder: 'ghp_...' },
  { key: 'kimi_api_key', name: 'kimi', label: 'KIMI (Moonshot)', abbr: 'KM', color: '#3b82f6', placeholder: 'sk-...' },
  { key: 'nvidia_api_key', name: 'nvidia', label: 'NVIDIA NIM', abbr: 'NV', color: '#76b900', placeholder: 'nvapi-...' },
  { key: 'local', name: 'local', label: 'Local LLM', abbr: 'LC', color: '#10b981', placeholder: '', isLocal: true },
]

function isProviderConfigured(config: any, p: ProviderDef): boolean {
  if (p.isLocal) {
    return !!(config.llm.local_llm_base_url)
  }
  return !!(config.llm[p.key as keyof typeof config.llm])
}

export default function LLMModelsTab() {
  const { config, updateLLMConfig, setConfig } = useSettingsStore()
  const [selected, setSelected] = useState<string>('openai')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [customInput, setCustomInput] = useState<Record<string, string>>({})

  const toggleShow = (key: string) =>
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))

  const addModel = (providerName: string) => {
    const model = (customInput[providerName] || '').trim()
    if (!model) return
    const current = config.llm.custom_models[providerName] || []
    if (current.includes(model)) return
    updateLLMConfig({
      custom_models: {
        ...config.llm.custom_models,
        [providerName]: [...current, model],
      },
    })
    setCustomInput((prev) => ({ ...prev, [providerName]: '' }))
  }

  const removeModel = (providerName: string, model: string) => {
    const current = config.llm.custom_models[providerName] || []
    updateLLMConfig({
      custom_models: {
        ...config.llm.custom_models,
        [providerName]: current.filter((m) => m !== model),
      },
    })
  }

  const selectedProvider = providers.find((p) => p.name === selected)!

  return (
    <div className="flex gap-6 min-h-[480px]">
      {/* Left: Provider Icon Grid */}
      <div className="w-[280px] flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Providers</h2>
        <div className="grid grid-cols-3 gap-2">
          {providers.map((p) => {
            const configured = isProviderConfigured(config, p)
            const isActive = selected === p.name
            return (
              <button
                key={p.name}
                onClick={() => setSelected(p.name)}
                className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-150 ${
                  isActive
                    ? 'border-slate-500 bg-slate-700/80 shadow-lg shadow-slate-900/50'
                    : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600'
                }`}
              >
                {/* Configured indicator dot */}
                {configured && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                )}
                {/* Icon circle */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: p.color + '25', color: p.color }}
                >
                  {p.isLocal ? <Monitor size={18} /> : p.abbr}
                </div>
                {/* Label */}
                <span className={`text-[10px] leading-tight text-center ${
                  isActive ? 'text-slate-200' : 'text-slate-400'
                }`}>
                  {p.label.split(' ')[0]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Default Model & Browser Headless */}
        <div className="mt-5 pt-4 border-t border-slate-700/50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Default Model
            </label>
            <input
              type="text"
              value={config.llm.default_model}
              onChange={(e) => updateLLMConfig({ default_model: e.target.value })}
              placeholder="e.g. gpt-4o"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.browser_headless}
              onChange={(e) =>
                setConfig({ ...config, browser_headless: e.target.checked })
              }
              className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500"
            />
            <span className="text-xs text-slate-400">Headless browser</span>
          </label>
        </div>
      </div>

      {/* Right: Selected Provider Detail Panel */}
      <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ backgroundColor: selectedProvider.color + '25', color: selectedProvider.color }}
          >
            {selectedProvider.isLocal ? <Monitor size={18} /> : selectedProvider.abbr}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-200">{selectedProvider.label}</h3>
            <span className={`text-xs ${
              isProviderConfigured(config, selectedProvider) ? 'text-emerald-400' : 'text-slate-500'
            }`}>
              {isProviderConfigured(config, selectedProvider) ? 'Configured' : 'Not configured'}
            </span>
          </div>
        </div>

        {/* API Key / Base URL */}
        {selectedProvider.isLocal ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Base URL</label>
              <input
                type="text"
                value={config.llm.local_llm_base_url || ''}
                onChange={(e) => updateLLMConfig({ local_llm_base_url: e.target.value })}
                placeholder="http://localhost:11434/v1"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ollama: http://localhost:11434/v1 &nbsp;|&nbsp; LM Studio: http://localhost:1234/v1
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">API Key (optional)</label>
              <div className="flex gap-2">
                <input
                  type={showKeys['local_llm_api_key'] ? 'text' : 'password'}
                  value={config.llm.local_llm_api_key || ''}
                  onChange={(e) => updateLLMConfig({ local_llm_api_key: e.target.value })}
                  placeholder="optional"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600"
                />
                <button
                  onClick={() => toggleShow('local_llm_api_key')}
                  className="w-10 h-10 bg-slate-900 border border-slate-600 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                >
                  {showKeys['local_llm_api_key'] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKeys[selectedProvider.key] ? 'text' : 'password'}
                value={(config.llm as any)[selectedProvider.key] || ''}
                onChange={(e) => updateLLMConfig({ [selectedProvider.key]: e.target.value })}
                placeholder={selectedProvider.placeholder}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
              />
              <button
                onClick={() => toggleShow(selectedProvider.key)}
                className="w-10 h-10 bg-slate-900 border border-slate-600 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
              >
                {showKeys[selectedProvider.key] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* Models */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Models</label>
          <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
            {(config.llm.custom_models[selectedProvider.name] || []).map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md"
                style={{
                  backgroundColor: selectedProvider.color + '18',
                  color: selectedProvider.color,
                }}
              >
                {m}
                <button
                  onClick={() => removeModel(selectedProvider.name, m)}
                  className="hover:text-red-400 ml-0.5"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {(config.llm.custom_models[selectedProvider.name] || []).length === 0 && (
              <span className="text-xs text-slate-500 italic">No models added yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput[selectedProvider.name] || ''}
              onChange={(e) =>
                setCustomInput((prev) => ({ ...prev, [selectedProvider.name]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addModel(selectedProvider.name)
                }
              }}
              placeholder={selectedProvider.isLocal ? 'e.g. llama3, mistral, qwen2.5' : 'Type model name and press Enter'}
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
            />
            <button
              onClick={() => addModel(selectedProvider.name)}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
