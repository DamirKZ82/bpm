import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, hasToken, setToken } from './api/client'
import type { User } from './api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false)
      return
    }
    api<User>('/api/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (username: string) => {
    const data = await api<{ access_token: string; user: User }>('/api/auth/dev-login', {
      method: 'POST',
      body: { username },
    })
    setToken(data.access_token)
    setUser(data.user)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
