import { create } from 'zustand'
import { api } from '../services/api'

interface AuthUser {
  username: string
  role: 'admin' | 'analyst' | 'viewer'
}

// Restore synchronously so the first render already knows auth state — no flash.
function loadPersistedAuth(): { token: string | null; user: AuthUser | null } {
  const token = localStorage.getItem('auth_token')
  const raw = localStorage.getItem('auth_user')
  if (!token || !raw) return { token: null, user: null }
  try {
    return { token, user: JSON.parse(raw) as AuthUser }
  } catch {
    return { token: null, user: null }
  }
}

const { token: _token, user: _user } = loadPersistedAuth()

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: _user,
  token: _token,
  isAuthenticated: !!(_token && _user),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.login(username, password)
      const user: AuthUser = { username: data.username, role: data.role as AuthUser['role'] }
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      set({ token: data.access_token, user, isAuthenticated: true, isLoading: false })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Login failed'
      set({ isLoading: false, error: msg })
      throw err
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch {
      /* best-effort */
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    set({ user: null, token: null, isAuthenticated: false })
  },
}))

export const canEdit = (role?: string) => role === 'admin' || role === 'analyst'
export const isAdmin = (role?: string) => role === 'admin'
