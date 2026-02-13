import { useState, useEffect } from 'react'
import { User, Bot, LogOut, Save, CheckCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getUserProfile, saveUserProfile, getSanchoProfile, saveSanchoProfile } from '../../api/client'
import { LANGUAGES, GENDERS, COUNTRIES } from '../../constants/profileOptions'

interface GoogleAuthStatus {
  logged_in: boolean
  email?: string
  name?: string
  picture_url?: string
}

export default function ProfileTab() {
  const { t } = useTranslation()
  // Google auth state
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus>({ logged_in: false })
  const [googleLoading, setGoogleLoading] = useState(false)

  // Profile fields
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [language, setLanguage] = useState('en')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [sanchoNickname, setSanchoNickname] = useState('Sancho')
  const [sanchoRole, setSanchoRole] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Parse markdown profile content (- Key: Value format)
  const parseProfileMd = (content: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const match = line.match(/^- (\w+): (.+)$/)
      if (match) result[match[1]] = match[2]
    }
    return result
  }

  // Load existing profile data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load Google auth status
        const authStatus = await window.electronAPI?.googleAuth?.getStatus()
        if (authStatus) setGoogleAuth(authStatus)

        // Load user profile
        const userProfile = await getUserProfile()
        if (userProfile.exists && userProfile.content) {
          const fields = parseProfileMd(userProfile.content)
          if (fields.Name) setName(fields.Name)
          if (fields.Gender) setGender(fields.Gender)
          if (fields.Language) setLanguage(fields.Language)
          if (fields.Country) {
            // Country is stored as name, need to reverse-lookup code or keep as name
            const found = COUNTRIES.find((c) => c.name === fields.Country)
            setCountry(found ? found.code : fields.Country)
          }
          if (fields.City && fields.City !== '-') setCity(fields.City)
        }

        // Load sancho profile
        const sanchoProfile = await getSanchoProfile()
        if (sanchoProfile.exists && sanchoProfile.content) {
          const fields = parseProfileMd(sanchoProfile.content)
          if (fields.Nickname) setSanchoNickname(fields.Nickname)
          if (fields.Role) setSanchoRole(fields.Role)
        }
      } catch (err) {
        console.error('Failed to load profile:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      const result = await window.electronAPI?.googleAuth?.login()
      if (result) {
        setGoogleAuth({
          logged_in: true,
          email: result.email,
          name: result.name,
          picture_url: result.picture_url,
        })
      }
    } catch (err) {
      console.error('Google login failed:', err)
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleGoogleLogout = async () => {
    try {
      await window.electronAPI?.googleAuth?.logout()
      setGoogleAuth({ logged_in: false })
    } catch (err) {
      console.error('Google logout failed:', err)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(`Failed to save: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Google Account Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          {t('profile.googleAccount')}
        </h3>
        {googleAuth.logged_in ? (
          <div className="flex items-center gap-4">
            {googleAuth.picture_url ? (
              <img
                src={googleAuth.picture_url}
                alt="Profile"
                className="w-12 h-12 rounded-full border-2 border-slate-600"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-angel-600/20 flex items-center justify-center">
                <User size={20} className="text-angel-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{googleAuth.name}</p>
              <p className="text-xs text-slate-400 truncate">{googleAuth.email}</p>
            </div>
            <button
              onClick={handleGoogleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors shrink-0"
            >
              <LogOut size={14} />
              {t('profile.logout')}
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {t('profile.signInWithGoogle')}
            </button>
          </div>
        )}
      </div>

      {/* User Profile Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center gap-2 text-angel-400 mb-4">
          <User size={18} />
          <h3 className="text-sm font-semibold uppercase tracking-wider">{t('profile.userInfo')}</h3>
        </div>
        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
            />
          </div>
          {/* Gender */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.gender')}</label>
            <div className="grid grid-cols-4 gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGender(g.value)}
                  className={`px-2 py-1.5 rounded-lg border text-xs transition-colors ${
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
          {/* Language */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.language')}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-angel-500 transition-colors"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native} ({l.name})
                </option>
              ))}
            </select>
          </div>
          {/* Country */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.country')}</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-angel-500 transition-colors"
            >
              <option value="">-</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.native}
                </option>
              ))}
            </select>
          </div>
          {/* City */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.city')}</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Enter your city"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Sancho Profile Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center gap-2 text-angel-400 mb-4">
          <Bot size={18} />
          <h3 className="text-sm font-semibold uppercase tracking-wider">{t('profile.sanchoIdentity')}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.nickname')}</label>
            <input
              type="text"
              value={sanchoNickname}
              onChange={(e) => setSanchoNickname(e.target.value)}
              placeholder="e.g. Sancho, Buddy, Jarvis..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('profile.role')}</label>
            <input
              type="text"
              value={sanchoRole}
              onChange={(e) => setSanchoRole(e.target.value)}
              placeholder="e.g. Personal secretary, Programming tutor..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-angel-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSaveProfile}
        disabled={saving}
        className="flex items-center gap-2 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {saved ? <CheckCircle size={16} /> : <Save size={16} />}
        {saving ? t('settings.saving') : saved ? t('settings.saved') : t('profile.saveProfile')}
      </button>
    </div>
  )
}
