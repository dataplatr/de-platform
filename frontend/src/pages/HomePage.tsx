import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Folder,
  Trash2,
  Clock,
  Database,
  Sun,
  Moon,
} from 'lucide-react'
import { useTransformationStore } from '../store/transformationStore'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../context/ThemeContext'
import { api } from '../services/api'
import type { TransformNode, TransformEdge } from '../types'
import clsx from 'clsx'
import logoWhite from '../assets/logo-white.png'
import { timeAgo } from '../utils/dateUtils'

interface PipelineMeta {
  id: string
  name: string
  node_count: number
  created_at: string
  updated_at: string
}

export function HomePage() {
  const { openEditor } = useTransformationStore()
  useAuthStore() // keep subscription alive
  const { theme, toggleTheme } = useTheme()

  const [pipelines, setPipelines] = useState<PipelineMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

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

  useEffect(() => {
    loadList()
  }, [loadList])

  const handleOpen = useCallback(
    async (meta: PipelineMeta) => {
      try {
        const res = await api.getPipeline(meta.id)
        openEditor({
          id: res.data.id,
          name: res.data.name,
          nodes: res.data.nodes as TransformNode[],
          edges: res.data.edges as TransformEdge[],
        })
      } catch {
        openEditor({ id: meta.id, name: meta.name })
      }
    },
    [openEditor]
  )

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
    <div className="home-page">
      {/* Top bar */}
      <div className="home-topbar flex items-center justify-between h-10 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <img src={logoWhite} alt="Logo" className="h-5 w-auto object-contain" />
          <div className="topbar-divider mx-1" />
          <Database size={13} className="topbar-db-icon" />
          <span className="text-xs font-medium topbar-app-name">dataplatr</span>
          <span className="topbar-chevron text-xs">/ Pipelines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="icon-button"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold home-heading">Pipelines</h1>
            <p className="text-xs home-subtext mt-0.5">
              {loading
                ? 'Loading…'
                : `${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor()}
            className="home-new-btn flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Plus size={13} />
            New Pipeline
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="home-card-skeleton" />
            ))}
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 home-empty-icon">
            <Folder size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium home-heading">No pipelines yet</p>
            <p className="text-xs home-subtext mt-1">Click "New Pipeline" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pipelines.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(p)}
                onKeyDown={(e) => e.key === 'Enter' && handleOpen(p)}
                className="home-card group"
              >
                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(p.id, e)}
                  disabled={deleting === p.id}
                  className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 icon-button hover:text-[#f44747] transition-opacity"
                  title="Delete pipeline"
                >
                  <Trash2 size={12} />
                </button>

                <div className="flex items-center gap-2">
                  <Folder size={14} className="topbar-db-icon shrink-0" />
                  <span className="text-sm font-medium home-heading truncate max-w-[160px]">
                    {p.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] home-subtext">
                  <span>
                    {p.node_count} node{p.node_count !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] home-empty-icon mt-auto">
                  <Clock size={9} />
                  <span>Updated {timeAgo(p.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
