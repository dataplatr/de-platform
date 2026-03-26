import { useCallback, useEffect, useState } from 'react'
import { Plus, Folder, Trash2, Clock, Database, LogOut, User, ShieldCheck } from 'lucide-react'
import { useTransformationStore } from '../store/transformationStore'
import { useAuthStore, isAdmin } from '../store/authStore'
import { api } from '../services/api'
import type { TransformNode, TransformEdge } from '../types'
import clsx from 'clsx'
import logoWhite from '../assets/logo-white.png'

interface PipelineMeta {
  id: string
  name: string
  node_count: number
  created_at: string
  updated_at: string
}

const ROLE_COLOR: Record<string, string> = {
  admin:   'text-[#f44747]',
  analyst: 'text-accent-light',
  viewer:  'text-text-dim',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function HomePage() {
  const { openEditor } = useTransformationStore()
  const { user, logout } = useAuthStore()

  const [pipelines, setPipelines] = useState<PipelineMeta[]>([])
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listPipelines()
      setPipelines(res.data)
    } catch {
      setPipelines([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const handleOpen = useCallback(async (meta: PipelineMeta) => {
    try {
      const res = await api.getPipeline(meta.id)
      openEditor({
        id:    res.data.id,
        name:  res.data.name,
        nodes: res.data.nodes as TransformNode[],
        edges: res.data.edges as TransformEdge[],
      })
    } catch {
      // fallback: open empty with same name/id
      openEditor({ id: meta.id, name: meta.name })
    }
  }, [openEditor])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    try {
      await api.deletePipeline(id)
      setPipelines((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setDeleting(null)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between h-10 px-4 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2">
          <img src={logoWhite} alt="Logo" className="h-5 w-auto object-contain" />
          <div className="w-px h-4 bg-[#3c3c3c] mx-1" />
          <Database size={13} className="text-[#4fc1ff]" />
          <span className="text-xs font-medium text-[#cccccc]">dataplatr</span>
          <span className="text-[#6a6a6a] text-xs">/ Pipelines</span>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 text-xs text-[#cccccc]">
              {isAdmin(user.role)
                ? <ShieldCheck size={13} className="text-[#f44747]" />
                : <User size={13} className="text-[#6a6a6a]" />
              }
              <span className="font-medium">{user.username}</span>
              <span className={clsx('text-[10px] uppercase font-semibold', ROLE_COLOR[user.role] ?? 'text-[#6a6a6a]')}>
                {user.role}
              </span>
            </div>
          )}
          <button type="button" onClick={logout} className="icon-button" title="Sign out">
            <LogOut size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-[#cccccc]">Pipelines</h1>
            <p className="text-xs text-[#6a6a6a] mt-0.5">
              {loading ? 'Loading…' : `${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e639c] hover:bg-[#1177bb] text-white text-xs rounded transition-colors"
          >
            <Plus size={13} />
            New Pipeline
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-[#252526] border border-[#3c3c3c] animate-pulse" />
            ))}
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-[#6a6a6a]">
            <Folder size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-[#969696]">No pipelines yet</p>
            <p className="text-xs mt-1">Click "New Pipeline" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleOpen(p)}
                className="group relative flex flex-col items-start gap-2 p-4 rounded-lg bg-[#252526] border border-[#3c3c3c] hover:border-[#4fc1ff] hover:bg-[#2d2d30] transition-all text-left"
              >
                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(p.id, e)}
                  disabled={deleting === p.id}
                  className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 icon-button text-[#6a6a6a] hover:text-[#f44747] transition-opacity"
                  title="Delete pipeline"
                >
                  <Trash2 size={12} />
                </button>

                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-[#4fc1ff] shrink-0" />
                  <span className="text-sm font-medium text-[#cccccc] truncate max-w-[160px]">{p.name}</span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-[#6a6a6a]">
                  <span>{p.node_count} node{p.node_count !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-[#4a4a4a] mt-auto">
                  <Clock size={9} />
                  <span>Updated {timeAgo(p.updated_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
