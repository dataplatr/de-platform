/**
 * WarehousePickerModal — shown when a connection exists but has no warehouse_id.
 * Lets the user pick a warehouse and saves it via PATCH /api/connections/:id.
 */
import { useCallback, useEffect, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { api } from '../../services/api'
import { useTransformationStore } from '../../store/transformationStore'
import type { DatabricksConnection } from '../../types'
import clsx from 'clsx'

interface Warehouse {
  id: string
  name: string
  state: string
  cluster_size: string
}

interface Props {
  connection: DatabricksConnection
  onClose: () => void
}

export function WarehousePickerModal({ connection, onClose }: Props) {
  const { connections, setConnections } = useTransformationStore()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listWarehouses(connection.id)
      .then(({ data }) => {
        setWarehouses(data)
        if (data.length > 0) setSelected(data[0].id)
      })
      .catch(() => setError('Could not load warehouses. Check your connection credentials.'))
      .finally(() => setLoading(false))
  }, [connection.id])

  const save = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const { data: updated } = await api.updateConnection(connection.id, { warehouse_id: selected })
      setConnections(connections.map(c => c.id === connection.id ? updated : c))
      onClose()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to save warehouse selection.')
      setSaving(false)
    }
  }, [selected, connection.id, connections, setConnections, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[440px] bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3c3c]">
          <div>
            <p className="text-sm font-semibold text-[#cccccc]">Select a SQL Warehouse</p>
            <p className="text-[11px] text-[#6a6a6a] mt-0.5">
              Connection <span className="font-mono text-[#4ec9b0]">{connection.alias}</span> has no warehouse configured.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#6a6a6a] hover:text-[#cccccc] p-1 rounded transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">

          {loading && (
            <div className="flex items-center gap-2 text-xs text-[#6a6a6a] py-4">
              <Loader2 size={13} className="animate-spin" />
              Loading warehouses from {connection.host.replace('https://', '')}…
            </div>
          )}

          {!loading && warehouses.length === 0 && !error && (
            <p className="text-xs text-[#f44747] py-2">No SQL warehouses found in this workspace.</p>
          )}

          {!loading && warehouses.length > 0 && (
            <div className="flex flex-col gap-2">
              {warehouses.map(w => (
                <label
                  key={w.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                    selected === w.id
                      ? 'border-[#4ec9b0] bg-[#1e3a2b]'
                      : 'border-[#2d2d30] bg-[#1a1a1a] hover:border-[#3c3c3c]'
                  )}
                >
                  <input
                    type="radio"
                    name="warehouse"
                    value={w.id}
                    checked={selected === w.id}
                    onChange={() => setSelected(w.id)}
                    className="accent-[#4ec9b0]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#cccccc] font-medium truncate">{w.name}</p>
                    <p className="text-[10px] text-[#6a6a6a]">{w.cluster_size} · {w.id}</p>
                  </div>
                  <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded uppercase font-bold shrink-0',
                    w.state === 'RUNNING' ? 'bg-[#1e3a2b] text-[#4ec9b0]' : 'bg-[#2d2d30] text-[#6a6a6a]'
                  )}>
                    {w.state}
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-[11px] text-[#f44747] bg-[#3a1e1e] border border-[#5a2e2e] rounded px-3 py-2.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[#6a6a6a] hover:text-[#969696] transition-colors px-3 py-2"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!selected || saving || loading}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg font-medium transition-colors',
                selected && !saving && !loading
                  ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3ab89e]'
                  : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
              )}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Use this warehouse
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
