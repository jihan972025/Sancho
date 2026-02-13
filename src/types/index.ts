export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  source?: 'chat' | 'whatsapp' | 'telegram' | 'matrix'
}

export interface ModelInfo {
  id: string
  provider: string
}

export interface FileInfo {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: number
}

export interface DeleteToken {
  token: string
  path: string
  item_count: number
  total_size: number
  expires_at: number
  message: string
}

export interface BrowserAgentState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  current_step: number
  max_steps: number
  task: string
  last_action: string
  last_thought: string
  error: string | null
  result: string | null
  last_snapshot: string | null
}

export interface LLMConfig {
  openai_api_key: string
  anthropic_api_key: string
  gemini_api_key: string
  zhipuai_api_key: string
  deepseek_api_key: string
  grok_api_key: string
  mistral_api_key: string
  perplexity_api_key: string
  qwen_api_key: string
  llama_api_key: string
  github_api_key: string
  kimi_api_key: string
  openrouter_api_key: string
  cloudflare_account_id: string
  cloudflare_api_key: string
  google_ai_studio_api_key: string
  nvidia_code: string
  local_llm_base_url: string
  local_llm_api_key: string
  default_model: string
  custom_models: Record<string, string[]>
}

export interface WhatsAppConfig {
  enabled: boolean
  wa_version: string
  default_model: string
  browser_keywords: string[]
}

export interface TelegramConfig {
  enabled: boolean
  api_id: string
  api_hash: string
  default_model: string
  browser_keywords: string[]
}

export interface MatrixConfig {
  enabled: boolean
  homeserver_url: string
  user_id: string
  password: string
  access_token: string
  default_model: string
  browser_keywords: string[]
}

export interface ApiConfig {
  duckduckgo_enabled: boolean
  tavily_api_key: string
  outlook_client_id: string
  outlook_client_secret: string
  gmail_client_id: string
  gmail_client_secret: string
  google_calendar_client_id: string
  google_calendar_client_secret: string
  google_sheets_client_id: string
  google_sheets_client_secret: string
  jira_url: string
  jira_email: string
  jira_api_token: string
  confluence_url: string
  confluence_email: string
  confluence_api_token: string
  slack_bot_token: string
  slack_app_token: string
  upbit_access_key: string
  upbit_secret_key: string
}

export interface NotifyApps {
  whatsapp: boolean
  telegram: boolean
  matrix: boolean
}

export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  model: string
  schedule_type: 'cron' | 'interval'
  cron_hour: number
  cron_minute: number
  cron_days: string[]
  interval_minutes: number
  timezone: string
  notify_apps: NotifyApps
  enabled: boolean
  created_at: string
  last_run: string | null
  last_result: string | null
}

export interface TaskLog {
  id: string
  task_id: string
  task_name: string
  executed_at: string
  result: string
  status: 'success' | 'error'
}

export interface CustomApiDef {
  name: string
  display_name: string
  description: string
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body_template: string
  response_path: string
}

export interface Memory {
  id: string
  content: string
  category: 'fact' | 'preference' | 'instruction'
  created_at: string
  source: string
  enabled: boolean
}

export interface GoogleAuthConfig {
  access_token: string
  refresh_token: string
  token_expiry: string
  email: string
  name: string
  picture_url: string
  logged_in: boolean
}

export interface AppConfig {
  llm: LLMConfig
  whatsapp: WhatsAppConfig
  telegram: TelegramConfig
  matrix: MatrixConfig
  api: ApiConfig
  custom_apis: CustomApiDef[]
  safe_directories: string[]
  browser_headless: boolean
  google_auth: GoogleAuthConfig
  language: string
}

export interface ConversationSummary {
  id: string
  title: string
  model: string
  message_count: number
  preview: string
  created_at: string
  updated_at: string
}

export interface ConversationDetail {
  id: string
  title: string
  model: string
  messages: {
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: string
    source?: string
  }[]
  created_at: string
  updated_at: string
}
