import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { api } from './api/client'
import { useAuth } from './auth'
import { setLocale } from './i18n'
import { buildTheme } from './theme'
import type { ThemeMode } from './theme'

interface PreferencesState {
  mode: ThemeMode
  locale: string
  setMode: (mode: ThemeMode) => void
  setLocale: (locale: string) => void
}

const PreferencesContext = createContext<PreferencesState>({
  mode: 'light',
  locale: 'uz',
  setMode: () => {},
  setLocale: () => {},
})

/** Настройки интерфейса: тема и язык. Применяются мгновенно из localStorage,
 * подтягиваются из профиля при входе и сохраняются в него при смене. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem('bpm_theme') as ThemeMode) || 'light',
  )
  const [locale, setLocaleState] = useState<string>(
    () => localStorage.getItem('bpm_locale') || 'uz',
  )

  // при входе применяем сохранённые в профиле настройки
  useEffect(() => {
    if (!user) return
    if (user.theme && user.theme !== mode) {
      setModeState(user.theme as ThemeMode)
      localStorage.setItem('bpm_theme', user.theme)
    }
    if (user.locale && user.locale !== locale) {
      setLocaleState(user.locale)
      setLocale(user.locale)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const savePref = (body: { theme?: string; locale?: string }) => {
    if (user) api('/api/auth/preferences', { method: 'PATCH', body }).catch(() => {})
  }

  const setMode = (next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem('bpm_theme', next)
    savePref({ theme: next })
  }

  const changeLocale = (next: string) => {
    setLocaleState(next)
    setLocale(next)
    savePref({ locale: next })
  }

  const theme = useMemo(() => buildTheme(mode), [mode])

  return (
    <PreferencesContext.Provider
      value={{ mode, locale, setMode, setLocale: changeLocale }}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </PreferencesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  return useContext(PreferencesContext)
}
