import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en/common.json'
import ur from './locales/ur/common.json'

export const RTL_LANGUAGES = new Set(['ur'])

/** Drives `dir` + `lang` on <html> from the active locale — the font-family swap itself
 *  (Inter/Manrope -> Noto Sans Arabic) is handled in index.css via `:lang(ur)`, not here. */
function applyDocumentDirection(language: string) {
  const dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = language
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      ur: { common: ur },
    },
    ns: ['common'],
    defaultNS: 'common',
    fallbackLng: 'en',
    supportedLngs: ['en', 'ur'],
    interpolation: { escapeValue: false },
  })

applyDocumentDirection(i18n.resolvedLanguage ?? 'en')
i18n.on('languageChanged', applyDocumentDirection)

export default i18n
