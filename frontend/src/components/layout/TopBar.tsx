import { useCallback, useRef, useState } from 'react'
import { Play, Save, Settings, Database, ChevronRight, LogOut, User, ShieldCheck, Home } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { useAuthStore, isAdmin } from '../../store/authStore'
import { api } from '../../services/api'
import clsx from 'clsx'
import logoWhite from '../../assets/logo-white.png'

const ROLE_COLOR: Record<string, string> = {
  admin:   'text-[#f44747]',
  analyst: 'text-accent-light',
  viewer:  'text-text-dim',
}

export function TopBar() {
  const {
    isConnected, nodes, edges,
    pipelineName, pipelineId,
    setPipelineName, setPipelineId, closeEditor,
  } = useTransformationStore()
  const { user, logout } = useAuthStore()

  // ── Inline rename ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
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
    if (e.key === 'Enter') commitRename()
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
    } catch {
      // silent — user sees Save button return to normal
    } finally {
      setSaving(false)
    }
  }, [saving, pipelineName, pipelineId, nodes, edges, setPipelineId])

  const hasNodes = nodes.length > 0

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-[#1e1e1e] border-b border-[#3c3c3c] shrink-0 z-10">

      {/* Left: Logo + Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#969696] min-w-0">
        <img src={logoWhite} alt="Logo" className="h-5 w-auto object-contain shrink-0" />
        <div className="w-px h-4 bg-border-default mx-1 shrink-0" />
        <Database size={14} className="text-accent-light shrink-0" />
        <span className="text-[#cccccc] font-medium shrink-0">dataplatr</span>
        <ChevronRight size={12} className="shrink-0" />

        {/* Editable pipeline name */}
        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={onKeyDown}
            aria-label="Pipeline name"
            className="bg-[#3c3c3c] text-[#4fc1ff] text-xs px-1.5 py-0.5 rounded outline-none border border-[#4fc1ff] min-w-0 w-40"
            maxLength={80}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            title="Click to rename"
            className="text-[#4fc1ff] hover:underline truncate max-w-[200px] text-left"
          >
            {pipelineName}
          </button>
        )}
      </div>

      {/* Center: Connection status */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          isConnected ? 'bg-[#1e3a2b] text-[#4ec9b0]' : 'bg-[#3a2b1e] text-[#dcdcaa]'
        )}>
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full',
            isConnected ? 'bg-[#4ec9b0]' : 'bg-[#dcdcaa]'
          )} />
          {isConnected ? 'DuckDB Connected' : 'No Connection'}
        </div>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Home */}
        <button
          type="button"
          onClick={closeEditor}
          className="icon-button"
          title="Back to pipelines"
        >
          <Home size={14} />
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            saving
              ? 'text-[#6a6a6a] cursor-wait'
              : 'hover:bg-[#3c3c3c] text-[#cccccc]'
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
            hasNodes
              ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
              : 'bg-[#2d2d30] text-[#6a6a6a] cursor-not-allowed'
          )}
          title="Run pipeline"
        >
          <Play size={13} />
          <span>Run</span>
        </button>

        <button type="button" className="icon-button ml-1" title="Settings">
          <Settings size={14} />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-border-default mx-1" />

        {/* User pill */}
        {user && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#cccccc]">
            {isAdmin(user.role)
              ? <ShieldCheck size={13} className="text-[#f44747]" />
              : <User size={13} className="text-text-dim" />
            }
            <span className="font-medium">{user.username}</span>
            <span className={clsx('text-[10px] uppercase font-semibold', ROLE_COLOR[user.role] ?? 'text-text-dim')}>
              {user.role}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="icon-button"
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  )
}
