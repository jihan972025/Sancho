import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ko from './locales/ko.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import ar from './locales/ar.json'
import hi from './locales/hi.json'
import vi from './locales/vi.json'
import th from './locales/th.json'
import id from './locales/id.json'
import tr from './locales/tr.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
    ja: { translation: ja },
    zh: { translation: zh },
    'zh-TW': { translation: zhTW },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    pt: { translation: pt },
    ru: { translation: ru },
    ar: { translation: ar },
    hi: { translation: hi },
    vi: { translation: vi },
    th: { translation: th },
    id: { translation: id },
    tr: { translation: tr },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
