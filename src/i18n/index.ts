import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pl from './pl.json'
import de from './de.json'

export const LANGUAGES = ['de', 'pl'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'lang'
const stored = localStorage.getItem(STORAGE_KEY)
const initial: Language = LANGUAGES.includes(stored as Language) ? (stored as Language) : 'de'

i18n.use(initReactI18next).init({
  resources: { pl: { translation: pl }, de: { translation: de } },
  lng: initial,
  fallbackLng: 'de',
  interpolation: { escapeValue: false }, // React already escapes
})

// Keep <html lang> and localStorage in sync with the active language.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  localStorage.setItem(STORAGE_KEY, lng)
})
document.documentElement.lang = initial

export default i18n
