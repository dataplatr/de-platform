import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Save,
  Database,
  ChevronRight,
  X,
  Plus,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import clsx from 'clsx'
import logoWhite from '../../assets/logo-white.png'
import { DatabricksConnectModal } from '../settings/DatabricksConnectModal'

// ── Warehouse state badge ─────────────────────────────────────────────────────

function WhStateDot({ state }: { state: string }) {
  return (
    <div
      className={clsx(
        'w-1.5 h-1.5 rounded-full shrink-0',
        state === 'RUNNING'
          ? 'bg-[var(--success)]'
          : state === 'STARTING'
            ? 'bg-[var(--warning)] animate-pulse'
            : state === 'STOPPING'
              ? 'bg-[var(--warning)] animate-pulse'
              : 'bg-[var(--text-3)]'
      )}
    />
  )
}

// ── Combined connection + warehouse manager panel ──────────────────────────────

function ConnectionPanel({ onClose }: { onClose: () => void }) {
  const {
    connections,
    setConnections,
    pipelineConnectionAlias,
    setPipelineConnectionAlias,
    warehouseState,
    setWarehouseState,
  } = useTransformationStore()

  const [showAdd, setShowAdd] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const activeAlias = pipelineConnectionAlias ?? connections[0]?.alias
  const activeConn = connections.find((c) => c.alias === activeAlias) ?? null

  // Warehouses for the active connection
  const [warehouses, setWarehouses] = useState<
    { id: string; name: string; state: string; cluster_size: string }[]
  >([])
  const [whLoading, setWhLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null) // warehouse id being switched to

  useEffect(() => {
    if (!activeConn) return
    setWhLoading(true)
    api
      .listWarehouses(activeConn.id)
      .then(({ data }) => setWarehouses(data))
      .catch(() => setWarehouses([]))
      .finally(() => setWhLoading(false))
  }, [activeConn?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onClose])

  const handleDeleteConn = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.deleteConnection(id)
      const updated = connections.filter((c) => c.id !== id)
      setConnections(updated)
      if (activeAlias === connections.find((c) => c.id === id)?.alias) {
        setPipelineConnectionAlias(updated[0]?.alias ?? null)
      }
    } catch {
      /* silent */
    }
  }

  const handleSwitchWarehouse = async (wh: { id: string; name: string }) => {
    if (!activeConn || wh.id === activeConn.warehouse_id) return
    setSwitching(wh.id)
    try {
      const { data: updated } = await api.updateConnection(activeConn.id, { warehouse_id: wh.id })
      setConnections(connections.map((c) => (c.id === updated.id ? updated : c)))
      setWarehouseState('STARTING')
      api.startWarehouse(activeConn.id).catch(() => {})
    } catch {
      /* silent */
    } finally {
      setSwitching(null)
    }
  }

  const whStateLabel = (state: string) =>
    state === 'RUNNING'
      ? 'Running'
      : state === 'STARTING'
        ? 'Starting…'
        : state === 'STOPPING'
          ? 'Stopping…'
          : state === 'STOPPED'
            ? 'Stopped'
            : state

  return (
    <>
      <div
        ref={panelRef}
        className="conn-panel absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-[200] w-80 rounded-lg shadow-2xl overflow-hidden"
      >
        {/* ── CONNECTIONS ─────────────────────────────────────── */}
        <div className="conn-panel-header flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold">Connections</span>
          <button type="button" onClick={onClose} className="icon-button" title="Close">
            <X size={12} />
          </button>
        </div>

        <div className="max-h-44 overflow-y-auto py-1">
          {connections.length === 0 ? (
            <p className="conn-item-host text-xs text-center py-4">No connections configured</p>
          ) : (
            connections.map((conn) => {
              const isActive = conn.alias === activeAlias
              return (
                <div
                  key={conn.id}
                  onClick={() => {
                    setPipelineConnectionAlias(conn.alias)
                    setWarehouses([])
                  }}
                  className={clsx(
                    'group conn-item flex items-center gap-2.5 px-3 py-2',
                    isActive && 'conn-item-active'
                  )}
                >
                  <div
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      isActive ? 'bg-[var(--success)]' : 'bg-[var(--text-3)]'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="conn-item-name text-xs font-medium truncate">
                        {conn.name || conn.alias}
                      </span>
                      {isActive && (
                        <CheckCircle2 size={11} className="text-[var(--success)] shrink-0" />
                      )}
                    </div>
                    <p className="conn-item-host text-[10px] truncate">{conn.host}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConn(conn.id, e)}
                    className="opacity-0 group-hover:opacity-100 icon-button transition-opacity"
                    title={`Remove ${conn.name || conn.alias}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="conn-panel-footer px-3 py-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="conn-add-btn flex items-center gap-1.5 text-xs w-full px-2 py-1.5"
          >
            <Plus size={12} /> Add connection
          </button>
        </div>

        {/* ── WAREHOUSES ──────────────────────────────────────── */}
        {activeConn && (
          <>
            <div className="conn-wh-header px-3 py-2 flex items-center gap-1.5">
              <Zap size={11} className="text-[var(--warning)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--text-1)]">SQL Warehouses</span>
              <span className="ml-auto text-[10px] text-[var(--text-3)]">
                {activeConn.name || activeConn.alias}
              </span>
            </div>

            <div className="max-h-52 overflow-y-auto py-1">
              {whLoading ? (
                <p className="conn-item-host text-xs text-center py-3">Loading warehouses…</p>
              ) : warehouses.length === 0 ? (
                <p className="conn-item-host text-xs text-center py-3">No warehouses found</p>
              ) : (
                warehouses.map((wh) => {
                  const isCurrent = wh.id === activeConn.warehouse_id
                  const isSwitching = switching === wh.id
                  return (
                    <div
                      key={wh.id}
                      onClick={() => handleSwitchWarehouse(wh)}
                      className={clsx(
                        'conn-item flex items-center gap-2.5 px-3 py-2',
                        isCurrent && 'conn-item-active',
                        !isCurrent && 'cursor-pointer'
                      )}
                    >
                      <WhStateDot state={wh.state} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="conn-item-name text-xs font-medium truncate">
                            {wh.name}
                          </span>
                          {isCurrent && (
                            <CheckCircle2 size={11} className="text-[var(--success)] shrink-0" />
                          )}
                        </div>
                        <p className="conn-item-host text-[10px]">
                          {wh.cluster_size} ·{' '}
                          {whStateLabel(isCurrent ? (warehouseState ?? wh.state) : wh.state)}
                        </p>
                      </div>
                      {!isCurrent && (
                        <span className="text-[10px] text-[var(--accent-fg)] shrink-0">
                          {isSwitching ? 'Switching…' : 'Use this'}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <DatabricksConnectModal
          onClose={() => {
            setShowAdd(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export function TopBar() {
  const {
    connections,
    nodes,
    edges,
    pipelineName,
    pipelineId,
    setPipelineName,
    setPipelineId,
    warehouseState,
  } = useTransformationStore()
  useAuthStore() // keep subscription alive for connection state reactivity

  // ── Inline rename ────────────────────────────────────────────────────────
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitRename()
      if (e.key === 'Escape') setEditing(false)
    },
    [commitRename]
  )

  // ── Save pipeline ────────────────────────────────────────────────────────
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
      /* silent */
    } finally {
      setSaving(false)
    }
  }, [saving, pipelineName, pipelineId, nodes, edges, setPipelineId])

  // ── Connection panel ─────────────────────────────────────────────────────
  const [showConnPanel, setShowConnPanel] = useState(false)

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
            onChange={(e) => setDraftName(e.target.value)}
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

      {/* Center: chips → click to open connection + warehouse manager */}
      <div className="relative flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowConnPanel((v) => !v)}
          title="Manage connections"
          className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity',
            connections.length > 0 ? 'db-chip-connected' : 'db-chip-disconnected'
          )}
        >
          <div
            className={clsx(
              'w-1.5 h-1.5 rounded-full',
              connections.length > 0 ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'
            )}
          />
          {connections.length > 0
            ? `${connections.length} Connection${connections.length > 1 ? 's' : ''}`
            : 'No Connection'}
        </button>

        {warehouseState && (
          <button
            type="button"
            onClick={() => setShowConnPanel((v) => !v)}
            title="Manage warehouses"
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity',
              warehouseState === 'RUNNING'
                ? 'bg-[var(--node-output-bg)] text-[var(--success)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-2)]'
            )}
          >
            <WhStateDot state={warehouseState} />
            {warehouseState === 'RUNNING'
              ? 'Warehouse Ready'
              : warehouseState === 'STARTING'
                ? 'Starting…'
                : warehouseState === 'STOPPING'
                  ? 'Stopping…'
                  : warehouseState}
          </button>
        )}

        {showConnPanel && <ConnectionPanel onClose={() => setShowConnPanel(false)} />}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
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
          {pipelineId && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Saved" />
          )}
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

      </div>
    </div>
  )
}
