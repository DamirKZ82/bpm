import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api/client'

interface Branding {
  appName: string
  logoUrl: string | null
}

interface BrandingCtx extends Branding {
  refresh: () => void
}

const Ctx = createContext<BrandingCtx>({
  appName: 'BPM',
  logoUrl: null,
  refresh: () => {},
})

/** Название и логотип приложения (white-label). Грузятся из /api/branding
 * (публичный эндпоинт — нужны и до входа). Правятся в «Настройки BPM». */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>({
    appName: 'BPM',
    logoUrl: null,
  })

  const refresh = useCallback(() => {
    api<{ app_name: string; logo_url: string | null }>('/api/branding')
      .then((r) => setBranding({ appName: r.app_name, logoUrl: r.logo_url }))
      .catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { document.title = branding.appName }, [branding.appName])

  return (
    <Ctx.Provider value={{ ...branding, refresh }}>{children}</Ctx.Provider>
  )
}

export const useBranding = () => useContext(Ctx)
