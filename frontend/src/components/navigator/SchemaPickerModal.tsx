/**
 * SchemaPickerModal — add/remove schemas for an existing connection.
 * Opens from the "+" button in ObjectNavigator.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react'
import { api } from '../../services/api'
import type { DatabricksConnection } from '../../types'
import clsx from 'clsx'

interface Props {
  connection: DatabricksConnection
  onClose: () => void
  onDone: () => void // called after schemas added so tree refreshes
}

interface CatalogEntry {
  name: string
  schemas?: string[]
  loading?: boolean
  expanded?: boolean
}

export function SchemaPickerModal({ connection, onClose, onDone }: Props) {
  const [catalogs, setCatalogs] = useState<CatalogEntry[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set()) // "catalog.schema"
  const [alreadySelected, setAlreadySelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load catalogs + already-selected schemas
  useEffect(() => {
    Promise.all([api.listCatalogs(connection.id), api.getSelectedSchemas(connection.id)])
      .then(([catsRes, selRes]) => {
        setCatalogs(catsRes.data.map((c) => ({ name: c.name })))
        const keys = new Set(selRes.data.map((s) => `${s.catalog}.${s.schema}`))
        setAlreadySelected(keys)
      })
      .catch(() => setError('Failed to load catalog'))
      .finally(() => setCatalogsLoading(false))
  }, [connection.id])

  const expandCatalog = useCallback(
    async (idx: number) => {
      const cat = catalogs[idx]
      if (cat.schemas) {
        setCatalogs((prev) => prev.map((c, i) => (i === idx ? { ...c, expanded: !c.expanded } : c)))
        return
      }
      setCatalogs((prev) => prev.map((c, i) => (i === idx ? { ...c, loading: true } : c)))
      try {
        const { data } = await api.listSchemas(connection.id, cat.name)
        setCatalogs((prev) =>
          prev.map((c, i) =>
            i === idx
              ? { ...c, schemas: data.map((s) => s.name), loading: false, expanded: true }
              : c
          )
        )
      } catch {
        setCatalogs((prev) => prev.map((c, i) => (i === idx ? { ...c, loading: false } : c)))
      }
    },
    [catalogs, connection.id]
  )

  const toggle = (catalog: string, schema: string) => {
    const key = `${catalog}.${schema}`
    if (alreadySelected.has(key)) return // already synced, can't deselect here
    setSelected((prev) => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const addSchemas = useCallback(async () => {
    if (selected.size === 0) {
      onClose()
      return
    }
    setAdding(true)
    setError(null)
    try {
      await Promise.all(
        Array.from(selected).map((key) => {
          const [catalog, ...rest] = key.split('.')
          const schema = rest.join('.')
          return api.addSchema(connection.id, catalog, schema)
        })
      )
      onDone()
      onClose()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to add schemas')
    } finally {
      setAdding(false)
    }
  }, [selected, connection.id, onClose, onDone])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[400px] max-h-[80vh] flex flex-col bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[#cccccc]">Add Schemas</p>
            <p className="text-[11px] text-[#6a6a6a] mt-0.5">{connection.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="text-[#6a6a6a] hover:text-[#cccccc] transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Catalog tree */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {catalogsLoading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-[#6a6a6a]">
              <Loader2 size={12} className="animate-spin" />
              Loading catalogs…
            </div>
          ) : catalogs.length === 0 ? (
            <div className="px-2 py-4 text-xs text-[#4a4a4a]">No catalogs found</div>
          ) : (
            catalogs.map((cat, idx) => (
              <div key={cat.name}>
                <div
                  onClick={() => expandCatalog(idx)}
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded text-xs font-medium text-[#cccccc]"
                >
                  <span className="w-3 text-[#6a6a6a]">
                    {cat.loading ? (
                      <Loader2 size={9} className="animate-spin" />
                    ) : cat.expanded ? (
                      <ChevronDown size={9} />
                    ) : (
                      <ChevronRight size={9} />
                    )}
                  </span>
                  <span className="uppercase">{cat.name}</span>
                </div>

                {cat.expanded && cat.schemas && (
                  <div className="ml-4">
                    {cat.schemas.map((schema) => {
                      const key = `${cat.name}.${schema}`
                      const already = alreadySelected.has(key)
                      const checked = already || selected.has(key)
                      return (
                        <div
                          key={schema}
                          onClick={() => toggle(cat.name, schema)}
                          className={clsx(
                            'flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors',
                            already
                              ? 'text-[#4a4a4a] cursor-default'
                              : 'text-[#cccccc] cursor-pointer hover:bg-[#2d2d30]'
                          )}
                        >
                          {checked ? (
                            <CheckSquare
                              size={12}
                              className={already ? 'text-[#4a4a4a]' : 'text-[#4ec9b0]'}
                            />
                          ) : (
                            <Square size={12} className="text-[#4a4a4a]" />
                          )}
                          <span>{schema}</span>
                          {already && (
                            <span className="ml-auto text-[9px] text-[#4a4a4a]">added</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#3c3c3c] flex flex-col gap-2 shrink-0">
          {error && (
            <div className="flex items-center gap-2 text-[11px] text-[#f44747]">
              <AlertCircle size={12} />
              {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6a6a6a]">
              {selected.size > 0
                ? `${selected.size} schema${selected.size > 1 ? 's' : ''} selected`
                : 'Select schemas to add'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-[#6a6a6a] hover:text-[#969696] px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addSchemas}
                disabled={adding}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors',
                  !adding
                    ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                    : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                )}
              >
                {adding && <Loader2 size={11} className="animate-spin" />}
                {selected.size === 0 ? 'Done' : 'Add & Sync'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
