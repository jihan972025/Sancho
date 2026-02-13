import { create } from 'zustand'
import i18n from '../i18n'
import type { AppConfig, LLMConfig, WhatsAppConfig, TelegramConfig, MatrixConfig, ApiConfig, CustomApiDef } from '../types'

interface SettingsState {
  config: AppConfig
  isLoaded: boolean
  setConfig: (config: AppConfig) => void
  updateLLMConfig: (llm: Partial<LLMConfig>) => void
  updateWhatsAppConfig: (wa: Partial<WhatsAppConfig>) => void
  updateTelegramConfig: (tg: Partial<TelegramConfig>) => void
  updateMatrixConfig: (mx: Partial<MatrixConfig>) => void
  updateApiConfig: (api: Partial<ApiConfig>) => void
  updateCustomApis: (custom_apis: CustomApiDef[]) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: {
    llm: {
      openai_api_key: '',
      anthropic_api_key: '',
      gemini_api_key: '',
      zhipuai_api_key: '',
      deepseek_api_key: '',
      grok_api_key: '',
      mistral_api_key: '',
      perplexity_api_key: '',
      qwen_api_key: '',
      llama_api_key: '',
      github_api_key: '',
      kimi_api_key: '',
      openrouter_api_key: '',
      cloudflare_account_id: '',
      cloudflare_api_key: '',
      google_ai_studio_api_key: '',
      nvidia_code: '',
      local_llm_base_url: '',
      local_llm_api_key: '',
      default_model: '',
      custom_models: {},
    },
    whatsapp: {
      enabled: false,
      wa_version: '2,3000,1027934701',
      default_model: '',
      browser_keywords: [
        '검색', '찾아', '브라우저', '열어', '사이트', '웹',
        'search', 'browse', 'find', 'open', 'look up',
      ],
    },
    telegram: {
      enabled: false,
      api_id: '',
      api_hash: '',
      default_model: '',
      browser_keywords: [
        '검색', '찾아', '브라우저', '열어', '사이트', '웹',
        'search', 'browse', 'find', 'open', 'look up',
      ],
    },
    matrix: {
      enabled: false,
      homeserver_url: 'https://matrix.org',
      user_id: '',
      password: '',
      access_token: '',
      default_model: '',
      browser_keywords: [
        '검색', '찾아', '브라우저', '열어', '사이트', '웹',
        'search', 'browse', 'find', 'open', 'look up',
      ],
    },
    api: {
      duckduckgo_enabled: false,
      tavily_api_key: '',
      outlook_client_id: '',
      outlook_client_secret: '',
      gmail_client_id: '',
      gmail_client_secret: '',
      google_calendar_client_id: '',
      google_calendar_client_secret: '',
      google_sheets_client_id: '',
      google_sheets_client_secret: '',
      jira_url: '',
      jira_email: '',
      jira_api_token: '',
      confluence_url: '',
      confluence_email: '',
      confluence_api_token: '',
      slack_bot_token: '',
      slack_app_token: '',
      upbit_access_key: '',
      upbit_secret_key: '',
    },
    custom_apis: [],
    safe_directories: [],
    browser_headless: false,
    language: 'en',
  },
  isLoaded: false,

  setConfig: (config) => {
    if (config.language) {
      i18n.changeLanguage(config.language)
    }
    set({ config, isLoaded: true })
  },

  updateLLMConfig: (llm) =>
    set((state) => ({
      config: {
        ...state.config,
        llm: { ...state.config.llm, ...llm },
      },
    })),

  updateWhatsAppConfig: (wa) =>
    set((state) => ({
      config: {
        ...state.config,
        whatsapp: { ...state.config.whatsapp, ...wa },
      },
    })),

  updateTelegramConfig: (tg) =>
    set((state) => ({
      config: {
        ...state.config,
        telegram: { ...state.config.telegram, ...tg },
      },
    })),

  updateMatrixConfig: (mx) =>
    set((state) => ({
      config: {
        ...state.config,
        matrix: { ...state.config.matrix, ...mx },
      },
    })),

  updateApiConfig: (api) =>
    set((state) => ({
      config: {
        ...state.config,
        api: { ...state.config.api, ...api },
      },
    })),

  updateCustomApis: (custom_apis) =>
    set((state) => ({
      config: {
        ...state.config,
        custom_apis,
      },
    })),
}))
