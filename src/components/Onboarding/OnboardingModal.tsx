import { useState } from 'react'
import { User, Globe, MapPin, ChevronRight, ChevronLeft, Check, Bot } from 'lucide-react'
import { saveUserProfile, saveSanchoProfile } from '../../api/client'

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

const GENDERS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
]

const COUNTRIES = [
  { code: 'US', name: 'United States', native: '🇺🇸 United States' },
  { code: 'KR', name: 'South Korea', native: '🇰🇷 대한민국' },
  { code: 'JP', name: 'Japan', native: '🇯🇵 日本' },
  { code: 'CN', name: 'China', native: '🇨🇳 中国' },
  { code: 'TW', name: 'Taiwan', native: '🇹🇼 台灣' },
  { code: 'GB', name: 'United Kingdom', native: '🇬🇧 United Kingdom' },
  { code: 'CA', name: 'Canada', native: '🇨🇦 Canada' },
  { code: 'AU', name: 'Australia', native: '🇦🇺 Australia' },
  { code: 'DE', name: 'Germany', native: '🇩🇪 Deutschland' },
  { code: 'FR', name: 'France', native: '🇫🇷 France' },
  { code: 'ES', name: 'Spain', native: '🇪🇸 España' },
  { code: 'IT', name: 'Italy', native: '🇮🇹 Italia' },
  { code: 'PT', name: 'Portugal', native: '🇵🇹 Portugal' },
  { code: 'BR', name: 'Brazil', native: '🇧🇷 Brasil' },
  { code: 'MX', name: 'Mexico', native: '🇲🇽 México' },
  { code: 'AR', name: 'Argentina', native: '🇦🇷 Argentina' },
  { code: 'IN', name: 'India', native: '🇮🇳 India' },
  { code: 'RU', name: 'Russia', native: '🇷🇺 Россия' },
  { code: 'TR', name: 'Turkey', native: '🇹🇷 Türkiye' },
  { code: 'SA', name: 'Saudi Arabia', native: '🇸🇦 السعودية' },
  { code: 'AE', name: 'UAE', native: '🇦🇪 الإمارات' },
  { code: 'TH', name: 'Thailand', native: '🇹🇭 ประเทศไทย' },
  { code: 'VN', name: 'Vietnam', native: '🇻🇳 Việt Nam' },
  { code: 'ID', name: 'Indonesia', native: '🇮🇩 Indonesia' },
  { code: 'PH', name: 'Philippines', native: '🇵🇭 Philippines' },
  { code: 'MY', name: 'Malaysia', native: '🇲🇾 Malaysia' },
  { code: 'SG', name: 'Singapore', native: '🇸🇬 Singapore' },
  { code: 'NL', name: 'Netherlands', native: '🇳🇱 Nederland' },
  { code: 'SE', name: 'Sweden', native: '🇸🇪 Sverige' },
  { code: 'PL', name: 'Poland', native: '🇵🇱 Polska' },
]

interface Props {
  onComplete: () => void
}

export default function OnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [sanchoNickname, setSanchoNickname] = useState('Sancho')
  const [sanchoRole, setSanchoRole] = useState('')
  const [language, setLanguage] = useState('en')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalSteps = 5

  const canNext = () => {
    if (step === 0) return name.trim().length > 0 && gender.length > 0
    if (step === 1) return sanchoNickname.trim().length > 0
    if (step === 2) return language.length > 0
    if (step === 3) return country.length > 0
    return true
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const selectedCountry = COUNTRIES.find((c) => c.code === country)
      await saveUserProfile({
        name: name.trim(),
        gender,
        language,
        country: selectedCountry?.name || country,
        city: city.trim() || '-',
      })
      await saveSanchoProfile({
        nickname: sanchoNickname.trim() || 'Sancho',
        role: sanchoRole.trim(),
      })
      onComplete()
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-800 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-xl font-bold text-slate-100">Welcome to Sancho</h1>
          <p className="text-sm text-slate-400 mt-1">Let's personalize your experience</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 px-6 pb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-angel-500' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 min-h-[280px]">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-angel-400 mb-2">
                <User size={18} />
                <span className="text-sm font-medium">Your Name & Gender</span>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGender(g.value)}
                      className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                        gender === g.value
                          ? 'border-angel-500 bg-angel-600/10 text-angel-300'
                          : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-angel-400 mb-2">
                <Bot size={18} />
                <span className="text-sm font-medium">Sancho's Identity</span>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Nickname</label>
                <input
                  type="text"
                  value={sanchoNickname}
                  onChange={(e) => setSanchoNickname(e.target.value)}
                  placeholder="e.g. Sancho, Buddy, Jarvis..."
                  autoFocus
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">What should the AI call itself?</p>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Role (optional)</label>
                <input
                  type="text"
                  value={sanchoRole}
                  onChange={(e) => setSanchoRole(e.target.value)}
                  placeholder="e.g. Personal secretary, Programming tutor..."
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">Define the AI's role and personality.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-angel-400 mb-2">
                <Globe size={18} />
                <span className="text-sm font-medium">Preferred Language</span>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      language === lang.code
                        ? 'border-angel-500 bg-angel-600/10'
                        : 'border-slate-600 bg-slate-900 hover:border-slate-500'
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium text-slate-200">{lang.native}</span>
                      <span className="text-xs text-slate-500 ml-2">{lang.name}</span>
                    </div>
                    {language === lang.code && <Check size={14} className="text-angel-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-angel-400 mb-2">
                <MapPin size={18} />
                <span className="text-sm font-medium">Location</span>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-angel-500 transition-colors"
                >
                  <option value="">Select your country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.native}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">City (optional)</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Enter your city"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-angel-400 mb-2">
                <Check size={18} />
                <span className="text-sm font-medium">All set!</span>
              </div>
              <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Name</span>
                  <span className="text-sm text-slate-200">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Gender</span>
                  <span className="text-sm text-slate-200">{gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">AI Nickname</span>
                  <span className="text-sm text-slate-200">{sanchoNickname || 'Sancho'}</span>
                </div>
                {sanchoRole && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-400">AI Role</span>
                    <span className="text-sm text-slate-200">{sanchoRole}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Language</span>
                  <span className="text-sm text-slate-200">
                    {LANGUAGES.find((l) => l.code === language)?.native || language}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Country</span>
                  <span className="text-sm text-slate-200">
                    {COUNTRIES.find((c) => c.code === country)?.name || country}
                  </span>
                </div>
                {city && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-400">City</span>
                    <span className="text-sm text-slate-200">{city}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                You can update these settings later in the Settings panel.
              </p>
              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-400">{error}</p>
                  <button
                    onClick={onComplete}
                    className="text-xs text-red-300 underline mt-1 hover:text-red-200"
                  >
                    Skip and continue
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1 px-5 py-2 bg-angel-600 hover:bg-angel-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-angel-600 hover:bg-angel-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  Saving...
                </>
              ) : (
                'Get Started'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
