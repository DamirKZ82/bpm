import { useTranslation } from 'react-i18next'

/** Возвращает функцию, выбирающую название на текущем языке из name_i18n,
 * с откатом на основное name. Реактивно к переключению языка (через
 * useTranslation). Применяется к пользовательским данным — названиям видов
 * документов и настраиваемых полей. */
export function useLocalizeName() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return (name: string, nameI18n?: Record<string, string> | null): string =>
    (nameI18n && nameI18n[lang]) || name
}
