import { useCallback, useRef, useState } from 'react'
import { Play, Save, Database, ChevronRight, LogOut, User, ShieldCheck, Home, Sun, Moon } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { useAuthStore, isAdmin } from '../../store/authStore'
import { useTheme } from '../../context/ThemeContext'
import { api } from '../../services/api'
import clsx from 'clsx'
import logoWhite from '../../assets/logo-white.png'
import { ROLE_COLOR } from '../../constants/nodeMetadata'

export function TopBar() {
  const {
    isConnected, nodes, edges,
    pipelineName, pipelineId,
    setPipelineName, setPipelineId, closeEditor,
  } = useTransformationStore()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()

  // ── Inline rename ───────────────────────────────────────────────────────────
  const [editing, setEditing]     = useState(false)
  const [draftName, setDraftName] = useState(pipelineName)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = useCallback(() => {
    setDraftName(pipelineName)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [pipelineName])

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim() || 'Untitled Pipeline'
    setPipelineName(trimmed)
    setEditing(false)
  }, [draftName, setPipelineName])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  commitRename()
    if (e.key === 'Escape') setEditing(false)
  }, [commitRename])

  // ── Save pipeline ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = { name: pipelineName, nodes, edges }
      if (pipelineId) {
        await api.updatePipeline(pipelineId, payload)
      } else {
        const res = await api.savePipeline(payload)
        setPipelineId(res.data.id)
      }
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }, [saving, pipelineName, pipelineId, nodes, edges, setPipelineId])

  const hasNodes = nodes.length > 0

  return (
    <div className="topbar flex items-center justify-between h-10 px-3 shrink-0 z-10">

      {/* Left: Logo + Breadcrumb */}
      <div className="topbar-breadcrumb flex items-center gap-2 text-xs min-w-0">
        <img src={logoWhite} alt="Logo" className="h-5 w-auto object-contain shrink-0" />
        <div className="topbar-divider mx-1 shrink-0" />
        <Database size={14} className="topbar-db-icon shrink-0" />
        <span className="topbar-app-name font-medium shrink-0">dataplatr</span>
        <ChevronRight size={12} className="topbar-chevron shrink-0" />

        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={onKeyDown}
            aria-label="Pipeline name"
            className="topbar-rename-input text-xs px-1.5 py-0.5 rounded outline-none min-w-0 w-40"
            maxLength={80}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            title="Click to rename"
            className="topbar-pipeline-name hover:underline truncate max-w-[200px] text-left text-xs"
          >
            {pipelineName}
          </button>
        )}
      </div>

      {/* Center: Connection status */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          isConnected ? 'db-chip-connected' : 'db-chip-disconnected'
        )}>
          <div className={clsx('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-[var(--success)]' : 'bg-[var(--warning)]')} />
          {isConnected ? 'DuckDB Connected' : 'No Connection'}
        </div>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={closeEditor} className="icon-button" title="Back to pipelines">
          <Home size={14} />
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors icon-button',
            saving && 'opacity-50 cursor-wait'
          )}
          title="Save pipeline"
        >
          <Save size={13} />
          <span>{saving ? 'Saving…' : 'Save'}</span>
          {pipelineId && <span className="w-1.5 h-1.5 rounded-full bg-[#4ec9b0]" title="Saved" />}
        </button>

        <button
          type="button"
          disabled={!hasNodes}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            hasNodes ? 'topbar-run-btn' : 'topbar-run-btn-disabled cursor-not-allowed opacity-40'
          )}
          title="Run pipeline"
        >
          <Play size={13} />
          <span>Run</span>
        </button>

        <div className="topbar-divider mx-1" />

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="icon-button"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="topbar-divider mx-1" />

        {/* User pill */}
        {user && (
          <div className="topbar-user flex items-center gap-1.5 px-2 py-1 rounded text-xs">
            {isAdmin(user.role)
              ? <ShieldCheck size={13} className="text-[#f44747]" />
              : <User size={13} className="topbar-chevron" />
            }
            <span className="font-medium">{user.username}</span>
            <span className={clsx('topbar-user-role text-[10px] uppercase font-semibold', ROLE_COLOR[user.role])}>
              {user.role}
            </span>
          </div>
        )}

        <button type="button" onClick={logout} className="icon-button" title="Sign out">
          <LogOut size={13} />
        </button>
      </div>
    </div>
  )
}
