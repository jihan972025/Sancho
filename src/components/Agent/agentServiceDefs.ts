import type { LucideIcon } from 'lucide-react'
import {
  Search, Globe, Mail, ClipboardList, FileText, Hash, CloudSun, TrendingUp, BarChart3,
  BookOpen, Newspaper, Coins, Wallet, MapPin, Activity, Calendar, Wifi, Clock,
  Lightbulb, Link, Flag, Sparkles, Table, Rss, MessageCircle, FolderOpen,
} from 'lucide-react'

export interface DraggableServiceDef {
  id: string
  name: string
  icon: LucideIcon
  color: string
  bgColor: string
  category: 'free' | 'paid' | 'exchange' | 'chatapp'
}

export const allServices: DraggableServiceDef[] = [
  // ---- Free API Services (18) ----
  { id: 'duckduckgo', name: 'DuckDuckGo', icon: Search, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20', category: 'free' },
  { id: 'wttr', name: 'wttr.in', icon: CloudSun, color: 'text-sky-400', bgColor: 'bg-sky-500/10 border-sky-500/20', category: 'free' },
  { id: 'yfinance', name: 'yfinance', icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20', category: 'free' },
  { id: 'tradingview', name: 'TradingView', icon: BarChart3, color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20', category: 'free' },
  { id: 'frankfurter', name: 'Frankfurter', icon: Coins, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20', category: 'free' },
  { id: 'ccxt', name: 'ccxt', icon: Wallet, color: 'text-violet-400', bgColor: 'bg-violet-500/10 border-violet-500/20', category: 'free' },
  { id: 'wikipedia', name: 'Wikipedia', icon: BookOpen, color: 'text-stone-300', bgColor: 'bg-stone-500/10 border-stone-500/20', category: 'free' },
  { id: 'gnews', name: 'GNews', icon: Newspaper, color: 'text-rose-400', bgColor: 'bg-rose-500/10 border-rose-500/20', category: 'free' },
  { id: 'geopy', name: 'Geopy', icon: MapPin, color: 'text-lime-400', bgColor: 'bg-lime-500/10 border-lime-500/20', category: 'free' },
  { id: 'usgs', name: 'USGS', icon: Activity, color: 'text-red-300', bgColor: 'bg-red-400/10 border-red-400/20', category: 'free' },
  { id: 'nagerdate', name: 'Nager.Date', icon: Calendar, color: 'text-pink-400', bgColor: 'bg-pink-500/10 border-pink-500/20', category: 'free' },
  { id: 'ipapi', name: 'ip-api', icon: Wifi, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10 border-cyan-500/20', category: 'free' },
  { id: 'timezone', name: 'Timezone', icon: Clock, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10 border-indigo-500/20', category: 'free' },
  { id: 'trivia', name: 'Trivia', icon: Lightbulb, color: 'text-yellow-300', bgColor: 'bg-yellow-400/10 border-yellow-400/20', category: 'free' },
  { id: 'pyshorteners', name: 'URL Shortener', icon: Link, color: 'text-slate-300', bgColor: 'bg-slate-500/10 border-slate-500/20', category: 'free' },
  { id: 'restcountries', name: 'Countries', icon: Flag, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', category: 'free' },
  { id: 'zenquotes', name: 'ZenQuotes', icon: Sparkles, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20', category: 'free' },
  { id: 'krnews', name: 'KR News', icon: Rss, color: 'text-orange-300', bgColor: 'bg-orange-400/10 border-orange-400/20', category: 'free' },
  { id: 'filesystem', name: 'File System', icon: FolderOpen, color: 'text-amber-300', bgColor: 'bg-amber-400/10 border-amber-400/20', category: 'free' },

  // ---- Paid API Services (8) ----
  { id: 'tavily', name: 'Tavily', icon: Globe, color: 'text-teal-400', bgColor: 'bg-teal-500/10 border-teal-500/20', category: 'paid' },
  { id: 'outlook', name: 'Outlook', icon: Mail, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', category: 'paid' },
  { id: 'gmail', name: 'Gmail', icon: Mail, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20', category: 'paid' },
  { id: 'google_calendar', name: 'Google Calendar', icon: Calendar, color: 'text-blue-300', bgColor: 'bg-blue-400/10 border-blue-400/20', category: 'paid' },
  { id: 'google_sheets', name: 'Google Sheets', icon: Table, color: 'text-green-300', bgColor: 'bg-green-400/10 border-green-400/20', category: 'paid' },
  { id: 'jira', name: 'Jira', icon: ClipboardList, color: 'text-blue-500', bgColor: 'bg-blue-600/10 border-blue-600/20', category: 'paid' },
  { id: 'confluence', name: 'Confluence', icon: FileText, color: 'text-blue-300', bgColor: 'bg-blue-400/10 border-blue-400/20', category: 'paid' },
  { id: 'slack', name: 'Slack', icon: Hash, color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20', category: 'paid' },

  // ---- Crypto Exchanges (11) ----
  { id: 'upbit', name: 'Upbit', icon: TrendingUp, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', category: 'exchange' },
  { id: 'binance', name: 'Binance', icon: Coins, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20', category: 'exchange' },
  { id: 'coinbase', name: 'Coinbase', icon: Wallet, color: 'text-blue-500', bgColor: 'bg-blue-600/10 border-blue-600/20', category: 'exchange' },
  { id: 'bybit', name: 'Bybit', icon: TrendingUp, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20', category: 'exchange' },
  { id: 'okx', name: 'OKX', icon: BarChart3, color: 'text-slate-200', bgColor: 'bg-slate-500/10 border-slate-500/20', category: 'exchange' },
  { id: 'kraken', name: 'Kraken', icon: Activity, color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20', category: 'exchange' },
  { id: 'mexc', name: 'MEXC', icon: TrendingUp, color: 'text-blue-300', bgColor: 'bg-blue-400/10 border-blue-400/20', category: 'exchange' },
  { id: 'gateio', name: 'Gate.io', icon: Coins, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', category: 'exchange' },
  { id: 'kucoin', name: 'KuCoin', icon: Wallet, color: 'text-teal-400', bgColor: 'bg-teal-500/10 border-teal-500/20', category: 'exchange' },
  { id: 'bitget', name: 'Bitget', icon: BarChart3, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10 border-cyan-500/20', category: 'exchange' },
  { id: 'htx', name: 'HTX', icon: Activity, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', category: 'exchange' },

  // ---- Chat Apps (4) ----
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', category: 'chatapp' },
  { id: 'telegram', name: 'Telegram', icon: MessageCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', category: 'chatapp' },
  { id: 'matrix', name: 'Matrix', icon: MessageCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20', category: 'chatapp' },
  { id: 'slack_app', name: 'Slack', icon: Hash, color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20', category: 'chatapp' },
]

export function getServiceDef(serviceId: string): DraggableServiceDef | undefined {
  return allServices.find((s) => s.id === serviceId)
}

export const categoryLabels: Record<string, { en: string; ko: string }> = {
  free: { en: 'Free Services', ko: '무료 서비스' },
  paid: { en: 'Paid Services', ko: '유료 서비스' },
  exchange: { en: 'Crypto Exchanges', ko: '암호화폐 거래소' },
  chatapp: { en: 'Chat Apps', ko: '채팅 앱' },
}

/** i18n keys for sample prompts per service (3 per service) */
export const serviceSampleKeys: Record<string, [string, string, string]> = {
  // Free Services
  duckduckgo: ['agent.samples.duckduckgo1', 'agent.samples.duckduckgo2', 'agent.samples.duckduckgo3'],
  wttr: ['agent.samples.wttr1', 'agent.samples.wttr2', 'agent.samples.wttr3'],
  yfinance: ['agent.samples.yfinance1', 'agent.samples.yfinance2', 'agent.samples.yfinance3'],
  tradingview: ['agent.samples.tradingview1', 'agent.samples.tradingview2', 'agent.samples.tradingview3'],
  frankfurter: ['agent.samples.frankfurter1', 'agent.samples.frankfurter2', 'agent.samples.frankfurter3'],
  ccxt: ['agent.samples.ccxt1', 'agent.samples.ccxt2', 'agent.samples.ccxt3'],
  wikipedia: ['agent.samples.wikipedia1', 'agent.samples.wikipedia2', 'agent.samples.wikipedia3'],
  gnews: ['agent.samples.gnews1', 'agent.samples.gnews2', 'agent.samples.gnews3'],
  geopy: ['agent.samples.geopy1', 'agent.samples.geopy2', 'agent.samples.geopy3'],
  usgs: ['agent.samples.usgs1', 'agent.samples.usgs2', 'agent.samples.usgs3'],
  nagerdate: ['agent.samples.nagerdate1', 'agent.samples.nagerdate2', 'agent.samples.nagerdate3'],
  ipapi: ['agent.samples.ipapi1', 'agent.samples.ipapi2', 'agent.samples.ipapi3'],
  timezone: ['agent.samples.timezone1', 'agent.samples.timezone2', 'agent.samples.timezone3'],
  trivia: ['agent.samples.trivia1', 'agent.samples.trivia2', 'agent.samples.trivia3'],
  pyshorteners: ['agent.samples.pyshorteners1', 'agent.samples.pyshorteners2', 'agent.samples.pyshorteners3'],
  restcountries: ['agent.samples.restcountries1', 'agent.samples.restcountries2', 'agent.samples.restcountries3'],
  zenquotes: ['agent.samples.zenquotes1', 'agent.samples.zenquotes2', 'agent.samples.zenquotes3'],
  krnews: ['agent.samples.krnews1', 'agent.samples.krnews2', 'agent.samples.krnews3'],
  filesystem: ['agent.samples.filesystem1', 'agent.samples.filesystem2', 'agent.samples.filesystem3'],
  // Paid Services
  tavily: ['agent.samples.tavily1', 'agent.samples.tavily2', 'agent.samples.tavily3'],
  outlook: ['agent.samples.outlook1', 'agent.samples.outlook2', 'agent.samples.outlook3'],
  gmail: ['agent.samples.gmail1', 'agent.samples.gmail2', 'agent.samples.gmail3'],
  google_calendar: ['agent.samples.googleCalendar1', 'agent.samples.googleCalendar2', 'agent.samples.googleCalendar3'],
  google_sheets: ['agent.samples.googleSheets1', 'agent.samples.googleSheets2', 'agent.samples.googleSheets3'],
  jira: ['agent.samples.jira1', 'agent.samples.jira2', 'agent.samples.jira3'],
  confluence: ['agent.samples.confluence1', 'agent.samples.confluence2', 'agent.samples.confluence3'],
  slack: ['agent.samples.slack1', 'agent.samples.slack2', 'agent.samples.slack3'],
  // Crypto Exchanges
  upbit: ['agent.samples.upbit1', 'agent.samples.upbit2', 'agent.samples.upbit3'],
  binance: ['agent.samples.binance1', 'agent.samples.binance2', 'agent.samples.binance3'],
  coinbase: ['agent.samples.coinbase1', 'agent.samples.coinbase2', 'agent.samples.coinbase3'],
  bybit: ['agent.samples.bybit1', 'agent.samples.bybit2', 'agent.samples.bybit3'],
  okx: ['agent.samples.okx1', 'agent.samples.okx2', 'agent.samples.okx3'],
  kraken: ['agent.samples.kraken1', 'agent.samples.kraken2', 'agent.samples.kraken3'],
  mexc: ['agent.samples.mexc1', 'agent.samples.mexc2', 'agent.samples.mexc3'],
  gateio: ['agent.samples.gateio1', 'agent.samples.gateio2', 'agent.samples.gateio3'],
  kucoin: ['agent.samples.kucoin1', 'agent.samples.kucoin2', 'agent.samples.kucoin3'],
  bitget: ['agent.samples.bitget1', 'agent.samples.bitget2', 'agent.samples.bitget3'],
  htx: ['agent.samples.htx1', 'agent.samples.htx2', 'agent.samples.htx3'],
  // Chat Apps
  whatsapp: ['agent.samples.whatsapp1', 'agent.samples.whatsapp2', 'agent.samples.whatsapp3'],
  telegram: ['agent.samples.telegram1', 'agent.samples.telegram2', 'agent.samples.telegram3'],
  matrix: ['agent.samples.matrix1', 'agent.samples.matrix2', 'agent.samples.matrix3'],
  slack_app: ['agent.samples.slackApp1', 'agent.samples.slackApp2', 'agent.samples.slackApp3'],
}
