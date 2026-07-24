import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en, ru, uz } from './locales'

export const LANGUAGES = [
  { code: 'uz', label: "O'zbekcha" },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
] as const

const stored = localStorage.getItem('bpm_locale')

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: stored || 'uz',  // узбекский по умолчанию
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

export function setLocale(code: string) {
  localStorage.setItem('bpm_locale', code)
  void i18n.changeLanguage(code)
}

export default i18n
