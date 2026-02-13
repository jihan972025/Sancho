import { useState } from 'react'
import {
  Search, Globe, Mail, ClipboardList, FileText, Hash, CloudSun, TrendingUp, BarChart3,
  BookOpen, Newspaper, Coins, Wallet, MapPin, Activity, Calendar, Wifi, Clock,
  Lightbulb, Link, Flag, Sparkles, Table, Key, Rss,
  Eye, EyeOff, X, Check, Lock, Plus, Plug, Pencil, Trash2,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ApiConfig, CustomApiDef } from '../../types'

function SecretInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono"
      />
      <button
        onClick={() => setShow(!show)}
        className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

interface ServiceDef {
  id: string
  name: string
  icon: typeof Search
  color: string
  bgColor: string
  isConfigured: (api: ApiConfig) => boolean
  fields: { key: keyof ApiConfig; label: string; placeholder: string; secret?: boolean; type?: string }[]
  description: string
  alwaysOn?: boolean
}

const services: ServiceDef[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    icon: Search,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Free web search. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'wttr',
    name: 'wttr.in',
    icon: CloudSun,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Free real-time weather API. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'yfinance',
    name: 'yfinance',
    icon: TrendingUp,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Free real-time stock price data (Yahoo Finance). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    icon: BarChart3,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Technical analysis indicators (RSI, MACD, Bollinger Bands, Moving Averages). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter',
    icon: Coins,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'ECB foreign exchange rates (30+ currencies). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'ccxt',
    name: 'ccxt',
    icon: Wallet,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Real-time cryptocurrency prices from 100+ exchanges (Binance, Coinbase, etc.). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    icon: BookOpen,
    color: 'text-stone-300',
    bgColor: 'bg-stone-500/10 border-stone-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Wikipedia article search and summaries. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'gnews',
    name: 'GNews',
    icon: Newspaper,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10 border-rose-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Google News search (141 countries, 41 languages). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'geopy',
    name: 'Geopy',
    icon: MapPin,
    color: 'text-lime-400',
    bgColor: 'bg-lime-500/10 border-lime-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Geocoding — address ↔ coordinates (OpenStreetMap). Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'usgs',
    name: 'USGS',
    icon: Activity,
    color: 'text-red-300',
    bgColor: 'bg-red-400/10 border-red-400/20',
    isConfigured: () => true,
    fields: [],
    description: 'Real-time earthquake data from U.S. Geological Survey. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'nagerdate',
    name: 'Nager.Date',
    icon: Calendar,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10 border-pink-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Public holidays for 100+ countries. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'ipapi',
    name: 'ip-api',
    icon: Wifi,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'IP geolocation — location, ISP, timezone from IP address. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'timezone',
    name: 'Timezone',
    icon: Clock,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10 border-indigo-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Offline timezone lookup from coordinates. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'trivia',
    name: 'Trivia',
    icon: Lightbulb,
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-400/10 border-yellow-400/20',
    isConfigured: () => true,
    fields: [],
    description: 'Trivia quiz questions across 24 categories. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'pyshorteners',
    name: 'URL Shortener',
    icon: Link,
    color: 'text-slate-300',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'URL shortening via TinyURL. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'restcountries',
    name: 'Countries',
    icon: Flag,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Country info — capital, population, languages, borders, flags. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'zenquotes',
    name: 'ZenQuotes',
    icon: Sparkles,
    color: 'text-fuchsia-400',
    bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20',
    isConfigured: () => true,
    fields: [],
    description: 'Random inspirational quotes with author. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'krnews',
    name: 'KR News',
    icon: Rss,
    color: 'text-orange-300',
    bgColor: 'bg-orange-400/10 border-orange-400/20',
    isConfigured: () => true,
    fields: [],
    description: 'Korean news headlines via RSS — Yonhap, SBS, Donga, Hankyoreh, Kyunghyang, and more. Always enabled — no API key required.',
    alwaysOn: true,
  },
  {
    id: 'tavily',
    name: 'Tavily',
    icon: Globe,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
    isConfigured: (api) => !!api.tavily_api_key,
    fields: [
      { key: 'tavily_api_key', label: 'API Key', placeholder: 'tvly-...', secret: true },
    ],
    description: 'AI-optimized search API. Get your key at tavily.com.',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: Mail,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    isConfigured: (api) => !!(api.outlook_client_id && api.outlook_client_secret),
    fields: [
      { key: 'outlook_client_id', label: 'Client ID', placeholder: 'Azure AD Application (client) ID' },
      { key: 'outlook_client_secret', label: 'Client Secret', placeholder: 'Azure AD client secret', secret: true },
    ],
    description: 'Microsoft Outlook email integration via Azure AD.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    isConfigured: (api) => !!(api.gmail_client_id && api.gmail_client_secret),
    fields: [
      { key: 'gmail_client_id', label: 'Client ID', placeholder: 'Google OAuth 2.0 Client ID' },
      { key: 'gmail_client_secret', label: 'Client Secret', placeholder: 'Google OAuth 2.0 Client Secret', secret: true },
    ],
    description: 'Gmail email integration via Google OAuth 2.0.',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    icon: Calendar,
    color: 'text-blue-300',
    bgColor: 'bg-blue-400/10 border-blue-400/20',
    isConfigured: (api) => !!(api.google_calendar_client_id && api.google_calendar_client_secret),
    fields: [
      { key: 'google_calendar_client_id', label: 'Client ID', placeholder: 'Google OAuth 2.0 Client ID' },
      { key: 'google_calendar_client_secret', label: 'Client Secret', placeholder: 'Google OAuth 2.0 Client Secret', secret: true },
    ],
    description: 'Google Calendar event management via Google OAuth 2.0.',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    icon: Table,
    color: 'text-green-300',
    bgColor: 'bg-green-400/10 border-green-400/20',
    isConfigured: (api) => !!(api.google_sheets_client_id && api.google_sheets_client_secret),
    fields: [
      { key: 'google_sheets_client_id', label: 'Client ID', placeholder: 'Google OAuth 2.0 Client ID' },
      { key: 'google_sheets_client_secret', label: 'Client Secret', placeholder: 'Google OAuth 2.0 Client Secret', secret: true },
    ],
    description: 'Google Sheets spreadsheet read/write via Google OAuth 2.0.',
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: ClipboardList,
    color: 'text-blue-500',
    bgColor: 'bg-blue-600/10 border-blue-600/20',
    isConfigured: (api) => !!(api.jira_url && api.jira_api_token),
    fields: [
      { key: 'jira_url', label: 'Jira URL', placeholder: 'https://your-domain.atlassian.net' },
      { key: 'jira_email', label: 'Email', placeholder: 'your-email@company.com' },
      { key: 'jira_api_token', label: 'API Token', placeholder: 'Atlassian API token', secret: true },
    ],
    description: 'Atlassian Jira project management.',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    icon: FileText,
    color: 'text-blue-300',
    bgColor: 'bg-blue-400/10 border-blue-400/20',
    isConfigured: (api) => !!(api.confluence_url && api.confluence_api_token),
    fields: [
      { key: 'confluence_url', label: 'Confluence URL', placeholder: 'https://your-domain.atlassian.net/wiki' },
      { key: 'confluence_email', label: 'Email', placeholder: 'your-email@company.com' },
      { key: 'confluence_api_token', label: 'API Token', placeholder: 'Atlassian API token (same as Jira)', secret: true },
    ],
    description: 'Atlassian Confluence documentation.',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: Hash,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    isConfigured: (api) => !!(api.slack_bot_token),
    fields: [
      { key: 'slack_bot_token', label: 'Bot Token', placeholder: 'xoxb-...', secret: true },
      { key: 'slack_app_token', label: 'App Token', placeholder: 'xapp-...', secret: true },
    ],
    description: 'Slack workspace messaging.',
  },
  {
    id: 'upbit',
    name: 'Upbit',
    icon: TrendingUp,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    isConfigured: (api) => !!(api.upbit_access_key && api.upbit_secret_key),
    fields: [
      { key: 'upbit_access_key', label: 'Access Key', placeholder: 'Upbit Open API Access Key', secret: true },
      { key: 'upbit_secret_key', label: 'Secret Key', placeholder: 'Upbit Open API Secret Key', secret: true },
    ],
    description: 'Upbit cryptocurrency exchange API (KRW market). Get keys at upbit.com/mypage/open_api_management.',
  },
]

const EMPTY_CUSTOM_API: CustomApiDef = {
  name: '',
  display_name: '',
  description: '',
  url: '',
  method: 'GET',
  headers: {},
  body_template: '',
  response_path: '',
}

function CustomApiForm({
  api,
  onChange,
  onCancel,
}: {
  api: CustomApiDef
  onChange: (api: CustomApiDef) => void
  onCancel: () => void
}) {
  const [headersText, setHeadersText] = useState(
    Object.keys(api.headers).length > 0 ? JSON.stringify(api.headers, null, 2) : ''
  )
  const [headersError, setHeadersError] = useState('')

  const update = (partial: Partial<CustomApiDef>) => onChange({ ...api, ...partial })

  const handleHeadersChange = (text: string) => {
    setHeadersText(text)
    if (!text.trim()) {
      setHeadersError('')
      update({ headers: {} })
      return
    }
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        setHeadersError('')
        update({ headers: parsed })
      } else {
        setHeadersError('Must be a JSON object')
      }
    } catch {
      setHeadersError('Invalid JSON')
    }
  }

  const nameValid = /^[a-z][a-z0-9_]*$/.test(api.name)

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Skill Name</label>
          <input
            type="text"
            value={api.name}
            onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
            placeholder="my_api"
            className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono ${
              api.name && !nameValid ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          {api.name && !nameValid && (
            <p className="text-xs text-red-400 mt-1">Must start with letter, lowercase + underscores only</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
          <input
            type="text"
            value={api.display_name}
            onChange={(e) => update({ display_name: e.target.value })}
            placeholder="My Custom API"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <textarea
          value={api.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Describe what this API does so the LLM knows when to use it..."
          rows={2}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 resize-none"
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            URL <span className="text-slate-500 font-normal">({'use {query} as placeholder'})</span>
          </label>
          <input
            type="text"
            value={api.url}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://api.example.com/search?q={query}"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Method</label>
          <select
            value={api.method}
            onChange={(e) => update({ method: e.target.value as 'GET' | 'POST' })}
            className="h-[38px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Headers <span className="text-slate-500 font-normal">(JSON object, optional)</span>
        </label>
        <textarea
          value={headersText}
          onChange={(e) => handleHeadersChange(e.target.value)}
          placeholder={'{"Authorization": "Bearer YOUR_KEY"}'}
          rows={2}
          className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono resize-none ${
            headersError ? 'border-red-500' : 'border-slate-700'
          }`}
        />
        {headersError && <p className="text-xs text-red-400 mt-1">{headersError}</p>}
      </div>

      {api.method === 'POST' && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Body Template <span className="text-slate-500 font-normal">(JSON string, {'use {query} as placeholder'})</span>
          </label>
          <textarea
            value={api.body_template}
            onChange={(e) => update({ body_template: e.target.value })}
            placeholder={'{"prompt": "{query}", "max_tokens": 100}'}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono resize-none"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Response Path <span className="text-slate-500 font-normal">(dot-notation, optional, e.g. "data.results")</span>
        </label>
        <input
          type="text"
          value={api.response_path}
          onChange={(e) => update({ response_path: e.target.value })}
          placeholder="data.results"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ApiTab() {
  const { config, updateApiConfig, updateCustomApis } = useSettingsStore()
  const api = config.api
  const customApis = config.custom_apis ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newApi, setNewApi] = useState<CustomApiDef>({ ...EMPTY_CUSTOM_API })

  const selectedService = services.find((s) => s.id === selected)

  const handleAddApi = () => {
    if (!newApi.name || !newApi.url) return
    updateCustomApis([...customApis, newApi])
    setNewApi({ ...EMPTY_CUSTOM_API })
    setAddingNew(false)
  }

  const handleUpdateApi = (idx: number, updated: CustomApiDef) => {
    const next = [...customApis]
    next[idx] = updated
    updateCustomApis(next)
  }

  const handleDeleteApi = (idx: number) => {
    updateCustomApis(customApis.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  const freeServices = services.filter((s) => s.alwaysOn)
  const paidServices = services.filter((s) => !s.alwaysOn)
  const [freeCollapsed, setFreeCollapsed] = useState(false)
  const [paidCollapsed, setPaidCollapsed] = useState(false)

  const renderServiceGrid = (list: ServiceDef[]) => (
    <div className="grid grid-cols-6 gap-2">
      {list.map((svc) => {
        const Icon = svc.icon
        const configured = svc.isConfigured(api)
        const isSelected = selected === svc.id
        return (
          <button
            key={svc.id}
            onClick={() => setSelected(isSelected ? null : svc.id)}
            className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
              isSelected
                ? 'border-angel-500 bg-angel-500/10 ring-1 ring-angel-500'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
            }`}
          >
            {svc.alwaysOn ? (
              <div className="absolute top-1.5 right-1.5">
                <Lock size={10} className="text-green-400" />
              </div>
            ) : configured ? (
              <div className="absolute top-1.5 right-1.5">
                <Check size={12} className="text-green-400" />
              </div>
            ) : null}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${svc.bgColor}`}>
              <Icon size={18} className={svc.color} />
            </div>
            <span className="text-xs font-medium text-slate-300 truncate w-full text-center">{svc.name}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── Built-in Skills (Free) ── */}
      <div>
        <button
          onClick={() => setFreeCollapsed(!freeCollapsed)}
          className="flex items-center gap-2 w-full text-left group"
        >
          {freeCollapsed ? <ChevronRight size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          <Lock size={16} className="text-green-400" />
          <h2 className="text-lg font-semibold text-slate-200">Built-in Skills</h2>
          <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
            {freeServices.length} Free
          </span>
        </button>
        <p className="text-sm text-slate-500 ml-9 mt-1">
          No API key required. Always available.
        </p>
      </div>

      {!freeCollapsed && renderServiceGrid(freeServices)}

      {/* ── API Key Required ── */}
      <div className="border-t border-slate-700 pt-6">
        <button
          onClick={() => setPaidCollapsed(!paidCollapsed)}
          className="flex items-center gap-2 w-full text-left group"
        >
          {paidCollapsed ? <ChevronRight size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          <Key size={16} className="text-amber-400" />
          <h2 className="text-lg font-semibold text-slate-200">API Key Required</h2>
          <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
            {paidServices.filter((s) => s.isConfigured(api)).length}/{paidServices.length} Connected
          </span>
        </button>
        <p className="text-sm text-slate-500 ml-9 mt-1">
          Click a service to configure its API credentials.
        </p>
      </div>

      {!paidCollapsed && renderServiceGrid(paidServices)}

      {/* Config panel for selected service */}
      {selectedService && (
        <div className="border border-slate-700 rounded-lg overflow-hidden animate-in fade-in">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <selectedService.icon size={18} className={selectedService.color} />
              <h3 className="font-medium text-slate-200">{selectedService.name}</h3>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3">
            <p className="text-xs text-slate-500">{selectedService.description}</p>

            {/* Always-on services */}
            {selectedService.alwaysOn && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Lock size={12} className="text-green-400" />
                  <span className="text-sm text-green-400">Always enabled</span>
                </div>
              </div>
            )}

            {/* Service input fields */}
            {selectedService.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-slate-300 mb-1">{field.label}</label>
                {field.secret ? (
                  <SecretInput
                    value={api[field.key] as string}
                    onChange={(v) => updateApiConfig({ [field.key]: v })}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <input
                    type="text"
                    value={api[field.key] as string}
                    onChange={(e) => updateApiConfig({ [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 placeholder-slate-600 font-mono"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom APIs Section */}
      <div className="border-t border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-1">Custom APIs</h2>
            <p className="text-sm text-slate-400">
              Register your own REST APIs as LLM skills.
            </p>
          </div>
          <button
            onClick={() => { setAddingNew(true); setEditingIdx(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-angel-600 hover:bg-angel-700 text-white rounded-lg text-sm transition-colors"
          >
            <Plus size={14} />
            Add API
          </button>
        </div>

        {/* Existing custom APIs */}
        <div className="space-y-2">
          {customApis.map((cApi, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-purple-500/10 border-purple-500/20">
                  <Plug size={18} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{cApi.display_name || cApi.name}</span>
                    <span className="text-xs text-slate-500 font-mono">{cApi.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                      cApi.method === 'POST' ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'
                    }`}>
                      {cApi.method}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{cApi.url}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingIdx(editingIdx === idx ? null : idx); setAddingNew(false) }}
                    className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteApi(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {editingIdx === idx && (
                <div className="border border-slate-700 border-t-0 rounded-b-lg overflow-hidden">
                  <CustomApiForm
                    api={cApi}
                    onChange={(updated) => handleUpdateApi(idx, updated)}
                    onCancel={() => setEditingIdx(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new API form */}
        {addingNew && (
          <div className="border border-slate-700 rounded-lg overflow-hidden mt-2">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Plug size={18} className="text-purple-400" />
                <h3 className="font-medium text-slate-200">New Custom API</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddApi}
                  disabled={!newApi.name || !newApi.url}
                  className="flex items-center gap-1 px-3 py-1 bg-angel-600 hover:bg-angel-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                >
                  <Check size={14} />
                  Add
                </button>
                <button
                  onClick={() => { setAddingNew(false); setNewApi({ ...EMPTY_CUSTOM_API }) }}
                  className="text-slate-400 hover:text-white p-1 rounded"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <CustomApiForm
              api={newApi}
              onChange={setNewApi}
              onCancel={() => { setAddingNew(false); setNewApi({ ...EMPTY_CUSTOM_API }) }}
            />
          </div>
        )}

        {customApis.length === 0 && !addingNew && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No custom APIs registered. Click "Add API" to register one.
          </div>
        )}
      </div>
    </div>
  )
}
