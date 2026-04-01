import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../store/authStore'
import logoWhite from '../assets/logo-white.png'

export function LoginPage() {
  const { login, isLoading, error } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(username, password)
    } catch {
      // error already in store
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-app">
      {/* Card */}
      <div className="w-full max-w-sm bg-surface border border-theme rounded-lg px-8 py-10 flex flex-col gap-6 shadow-2xl">

        {/* Logo + product name */}
        <div className="flex flex-col items-center gap-3">
          <img src={logoWhite} alt="Company logo" className="h-9 w-auto object-contain" />
          <div className="text-center">
            <p className="text-muted text-xs tracking-widest uppercase mt-1">Lakeflow Designer</p>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-primary text-lg font-semibold text-center">Sign in to your account</h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted text-xs font-medium uppercase tracking-wide">Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="bg-elevated border border-theme rounded px-3 py-2 text-sm text-primary placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="admin"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted text-xs font-medium uppercase tracking-wide">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-elevated border border-theme rounded px-3 py-2 text-sm text-primary placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-error text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="login-submit-btn mt-1 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-elevated" />
          <span className="text-muted text-xs">or continue with</span>
          <div className="flex-1 h-px bg-elevated" />
        </div>

        {/* OAuth buttons — UI only, logic coming soon */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex items-center justify-center gap-3 border border-theme rounded px-4 py-2 text-sm text-muted cursor-not-allowed opacity-50 select-none"
          >
            {/* Google G icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Google Workspace</span>
            <span className="ml-auto text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5">Soon</span>
          </button>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex items-center justify-center gap-3 border border-theme rounded px-4 py-2 text-sm text-muted cursor-not-allowed opacity-50 select-none"
          >
            {/* Microsoft icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21" fill="none" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            <span>Microsoft Workspace</span>
            <span className="ml-auto text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5">Soon</span>
          </button>
        </div>

        <p className="text-muted text-[11px] text-center">
          Default credentials: <span className="font-mono text-primary">admin / admin</span>
        </p>
      </div>
    </div>
  )
}
