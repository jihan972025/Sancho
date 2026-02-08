import { useState } from 'react'
import { Eye, EyeOff, X, Plus } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

const providers = [
  { key: 'openai_api_key' as const, name: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { key: 'anthropic_api_key' as const, name: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { key: 'gemini_api_key' as const, name: 'gemini', label: 'Google Gemini', placeholder: 'AI...' },
  { key: 'zhipuai_api_key' as const, name: 'zhipuai', label: 'ZhipuAI', placeholder: '...' },
  { key: 'deepseek_api_key' as const, name: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { key: 'grok_api_key' as const, name: 'grok', label: 'Grok (xAI)', placeholder: 'xai-...' },
  { key: 'mistral_api_key' as const, name: 'mistral', label: 'Mistral', placeholder: '...' },
  { key: 'perplexity_api_key' as const, name: 'perplexity', label: 'Perplexity', placeholder: 'pplx-...' },
  { key: 'qwen_api_key' as const, name: 'qwen', label: 'Qwen (Alibaba)', placeholder: 'sk-...' },
  { key: 'llama_api_key' as const, name: 'llama', label: 'LLaMA (Together AI)', placeholder: '...' },
  { key: 'github_api_key' as const, name: 'github', label: 'GitHub Copilot', placeholder: 'ghp_...' },
]

export default function LLMModelsTab() {
  const { config, updateLLMConfig, setConfig } = useSettingsStore()
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-1">LLM Providers</h2>
        <p className="text-sm text-slate-400 mb-4">
          Configure API keys and models for each provider. Add model names manually.
        </p>
      </div>

      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.key}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3"
          >
            <div className="font-medium text-slate-200">{p.label}</div>

            {/* API Key */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">API Key</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type={showKeys[p.key] ? 'text' : 'password'}
                    value={config.llm[p.key]}
                    onChange={(e) => updateLLMConfig({ [p.key]: e.target.value })}
                    placeholder={p.placeholder}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
                  />
                </div>
                <button
                  onClick={() => toggleShow(p.key)}
                  className="w-10 h-10 bg-slate-900 border border-slate-600 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                >
                  {showKeys[p.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Models */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Models</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(config.llm.custom_models[p.name] || []).map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 bg-angel-500/20 text-angel-400 text-xs px-2 py-0.5 rounded"
                  >
                    {m}
                    <button
                      onClick={() => removeModel(p.name, m)}
                      className="hover:text-red-400"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {(config.llm.custom_models[p.name] || []).length === 0 && (
                  <span className="text-xs text-slate-500">No models added</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput[p.name] || ''}
                  onChange={(e) =>
                    setCustomInput((prev) => ({ ...prev, [p.name]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addModel(p.name)
                    }
                  }}
                  placeholder="Type model name and press Enter"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
                />
                <button
                  onClick={() => addModel(p.name)}
                  className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-400 hover:text-angel-400 hover:border-angel-500"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Default Model & Browser Headless */}
      <div className="border-t border-slate-700 pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Default Model
          </label>
          <input
            type="text"
            value={config.llm.default_model}
            onChange={(e) => updateLLMConfig({ default_model: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="headless"
            checked={config.browser_headless}
            onChange={(e) =>
              setConfig({ ...config, browser_headless: e.target.checked })
            }
            className="rounded border-slate-600 bg-slate-800 text-angel-500 focus:ring-angel-500"
          />
          <label htmlFor="headless" className="text-sm text-slate-300">
            Run browser in headless mode
          </label>
        </div>
      </div>
    </div>
  )
}
