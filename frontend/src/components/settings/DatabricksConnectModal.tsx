/**
 * DatabricksConnectModal — 3-screen connection wizard.
 *
 * Screen 1: Credentials
 *   Primary:  "Sign in with Databricks" → OAuth PKCE popup
 *   Fallback: PAT → discoverWarehouses
 * Screen 2: Warehouse picker
 *   OAuth:    listWarehouses(connectionId) + updateConnection(id, warehouse_id)
 *   PAT:      warehouses from discoverWarehouses + createConnection
 * Screen 3: Schema picker (optional — skip allowed)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  ExternalLink, CheckSquare, Square, Database,
} from 'lucide-react'
import { api } from '../../services/api'
import { useTransformationStore } from '../../store/transformationStore'
import type { DatabricksConnection } from '../../types'
import clsx from 'clsx'

interface Props { onClose: () => void }

type Screen = 'credentials' | 'warehouse' | 'schemas'
type AuthMethod = 'oauth' | 'pat'

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

function Field({
  label, value, onChange, type = 'text', placeholder, hint, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string; autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#6a6a6a] font-semibold uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className="border rounded px-2.5 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#0e639c] outline-none placeholder-[#4a4a4a] transition-colors"
      />
      {hint && <span className="text-[10px] text-[#4a4a4a] leading-relaxed">{hint}</span>}
    </div>
  )
}

// ── Schema picker sub-component ───────────────────────────────────────────────

interface CatalogEntry { name: string; schemas?: string[]; loading?: boolean; expanded?: boolean }

function SchemaPicker({
  connectionId,
  onDone,
  onSkip,
}: {
  connectionId: string
  onDone: () => void
  onSkip: () => void
}) {
  const [catalogs, setCatalogs] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listCatalogs(connectionId)
      .then(({ data }) => setCatalogs(data.map(c => ({ name: c.name }))))
      .catch(() => setError('Failed to load catalogs'))
      .finally(() => setLoading(false))
  }, [connectionId])

  const expandCatalog = useCallback(async (idx: number) => {
    const cat = catalogs[idx]
    if (cat.schemas) {
      setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, expanded: !c.expanded } : c))
      return
    }
    setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, loading: true } : c))
    try {
      const { data } = await api.listSchemas(connectionId, cat.name)
      setCatalogs(prev => prev.map((c, i) =>
        i === idx ? { ...c, schemas: data.map(s => s.name), loading: false, expanded: true } : c
      ))
    } catch {
      setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, loading: false } : c))
    }
  }, [catalogs, connectionId])

  const toggle = (catalog: string, schema: string) => {
    const key = `${catalog}.${schema}`
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  const addAndFinish = useCallback(async () => {
    if (selected.size === 0) { onSkip(); return }
    setAdding(true)
    setError(null)
    try {
      await Promise.all(
        Array.from(selected).map(key => {
          const [catalog, ...rest] = key.split('.')
          return api.addSchema(connectionId, catalog, rest.join('.'))
        })
      )
      onDone()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to add schemas')
      setAdding(false)
    }
  }, [selected, connectionId, onDone, onSkip])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#6a6a6a]">
        Select schemas to sync. Tables &amp; columns will be cached for instant drag-and-drop.
      </p>

      {/* Catalog tree */}
      <div className="border border-[#3c3c3c] rounded-lg overflow-hidden">
        <div className="max-h-[280px] overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-[#6a6a6a]">
              <Loader2 size={12} className="animate-spin" /> Loading catalogs…
            </div>
          ) : catalogs.length === 0 ? (
            <p className="py-4 text-xs text-[#4a4a4a]">No catalogs found.</p>
          ) : (
            catalogs.map((cat, idx) => (
              <div key={cat.name}>
                <div
                  onClick={() => expandCatalog(idx)}
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded text-xs font-medium text-[#cccccc]"
                >
                  <span className="w-3 text-[#6a6a6a]">
                    {cat.loading ? <Loader2 size={9} className="animate-spin" />
                      : cat.expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                  </span>
                  <Database size={10} className="text-[#4ec9b0] shrink-0" />
                  <span className="uppercase">{cat.name}</span>
                </div>

                {cat.expanded && cat.schemas && (
                  <div className="ml-4">
                    {cat.schemas.map(schema => {
                      const key = `${cat.name}.${schema}`
                      const checked = selected.has(key)
                      return (
                        <div
                          key={schema}
                          onClick={() => toggle(cat.name, schema)}
                          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-[#cccccc] cursor-pointer hover:bg-[#2d2d30]"
                        >
                          {checked
                            ? <CheckSquare size={12} className="text-[#4ec9b0]" />
                            : <Square size={12} className="text-[#4a4a4a]" />}
                          <span>{schema}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-[#f44747]">
          <AlertCircle size={12} />{error}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-[#6a6a6a]">
          {selected.size > 0 ? `${selected.size} schema${selected.size > 1 ? 's' : ''} selected` : 'None selected'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSkip}
            className="text-xs text-[#6a6a6a] hover:text-[#969696] px-3 py-1.5">
            Skip for now
          </button>
          <button
            type="button"
            onClick={addAndFinish}
            disabled={adding}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg font-medium transition-colors',
              !adding ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3ab89e]' : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
            )}
          >
            {adding && <Loader2 size={11} className="animate-spin" />}
            {selected.size === 0 ? 'Finish' : 'Add & Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function DatabricksConnectModal({ onClose }: Props) {
  const { connections, setConnections } = useTransformationStore()

  const [screen, setScreen] = useState<Screen>('credentials')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth')

  // ── Credentials fields ────────────────────────────────────────────────────────
  const [workspaceUrl, setWorkspaceUrl] = useState('')
  const [connName, setConnName]         = useState('')
  const [connAlias, setConnAlias]       = useState('')
  const [aliasManual, setAliasManual]   = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pat, setPat]                   = useState('')

  const [credError, setCredError]   = useState<string | null>(null)
  const [credLoading, setCredLoading] = useState(false)

  // ── Warehouse screen ──────────────────────────────────────────────────────────
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; state: string; cluster_size: string }[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [uploadCatalog, setUploadCatalog] = useState('')
  const [uploadSchema, setUploadSchema]   = useState('')
  const [uploadVolume, setUploadVolume]   = useState('')
  const [warehouseSaving, setWarehouseSaving] = useState(false)
  const [warehouseError, setWarehouseError] = useState<string | null>(null)

  const oauthPopupRef = useRef<Window | null>(null)

  const handleNameChange = (v: string) => {
    setConnName(v)
    if (!aliasManual) setConnAlias(slugify(v))
  }

  // ── Fetch warehouses for an already-created connection (OAuth path) ────────────
  const fetchWarehouses = useCallback(async (connId: string) => {
    try {
      const { data } = await api.listWarehouses(connId)
      setWarehouses(data)
      if (data.length > 0) setSelectedWarehouse(data[0].id)
    } catch {
      // non-fatal — user can still save with no warehouse pre-selected
    }
  }, [])

  // ── OAuth popup flow ──────────────────────────────────────────────────────────
  const startOAuth = useCallback(async () => {
    if (!workspaceUrl.startsWith('https://') || !connName.trim()) return
    setCredLoading(true)
    setCredError(null)

    try {
      const alias = connAlias.trim() || slugify(connName.trim())
      const { data } = await api.oauthStart(
        workspaceUrl.trim().replace(/\/$/, ''),
        connName.trim(),
        alias,
      )

      // Open popup
      const popup = window.open(data.auth_url, 'databricks_oauth',
        'width=600,height=700,left=200,top=100')
      oauthPopupRef.current = popup

      // Listen for postMessage from oauth-callback.html
      const handler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type !== 'DATABRICKS_OAUTH_RESULT') return
        window.removeEventListener('message', handler)
        setCredLoading(false)

        if (event.data.error) {
          setCredError(decodeURIComponent(event.data.error))
          return
        }
        const connId: string = event.data.connectionId
        setConnectionId(connId)
        await fetchWarehouses(connId)
        setScreen('warehouse')
      }
      window.addEventListener('message', handler)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCredError(detail ?? 'Could not start OAuth — check DATABRICKS_OAUTH_CLIENT_ID in server config.')
      setCredLoading(false)
    }
  }, [workspaceUrl, connName, connAlias, fetchWarehouses])

  // ── PAT flow ──────────────────────────────────────────────────────────────────
  const connectWithPAT = useCallback(async () => {
    setCredLoading(true)
    setCredError(null)
    try {
      const { data } = await api.discoverWarehouses(
        workspaceUrl.trim().replace(/\/$/, ''),
        pat.trim()
      )
      setWarehouses(data)
      if (data.length > 0) setSelectedWarehouse(data[0].id)
      setScreen('warehouse')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCredError(detail ?? 'Could not connect — check workspace URL and token.')
    } finally {
      setCredLoading(false)
    }
  }, [workspaceUrl, pat])

  // ── Warehouse save ────────────────────────────────────────────────────────────
  const saveWarehouse = useCallback(async () => {
    setWarehouseSaving(true)
    setWarehouseError(null)
    try {
      let conn: DatabricksConnection

      if (authMethod === 'oauth' && connectionId) {
        // OAuth: connection already exists, just update warehouse + upload
        const { data } = await api.updateConnection(connectionId, {
          warehouse_id: selectedWarehouse,
          upload_catalog: uploadCatalog.trim(),
          upload_schema: uploadSchema.trim(),
          upload_volume: uploadVolume.trim(),
        })
        conn = data
        // Refresh connections list
        const existing = connections.find(c => c.id === connectionId)
        if (existing) {
          setConnections(connections.map(c => c.id === connectionId ? conn : c))
        } else {
          // Not yet in the list (e.g. page reload edge case) — fetch fresh
          const { data: all } = await api.listConnections()
          setConnections(all)
        }
      } else {
        // PAT: create connection now
        const { data } = await api.createConnection({
          alias: connAlias.trim() || slugify(connName.trim()),
          name: connName.trim(),
          host: workspaceUrl.trim().replace(/\/$/, ''),
          token: pat.trim(),
          warehouse_id: selectedWarehouse,
          upload_catalog: uploadCatalog.trim(),
          upload_schema: uploadSchema.trim(),
          upload_volume: uploadVolume.trim(),
        })
        conn = data
        setConnections([...connections, conn])
        setConnectionId(conn.id)
      }

      setScreen('schemas')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setWarehouseError(detail ?? 'Failed to save connection.')
    } finally {
      setWarehouseSaving(false)
    }
  }, [
    authMethod, connectionId, selectedWarehouse,
    uploadCatalog, uploadSchema, uploadVolume,
    connAlias, connName, workspaceUrl, pat,
    connections, setConnections,
  ])

  // Clean up popup on unmount
  useEffect(() => {
    return () => { oauthPopupRef.current?.close() }
  }, [])

  const canConnectOAuth = workspaceUrl.startsWith('https://') && connName.trim().length > 0
  const canConnectPAT   = canConnectOAuth && pat.trim().length > 0

  const screenTitles: Record<Screen, { title: string; sub: string }> = {
    credentials: { title: 'Connect Databricks', sub: 'Sign in to your workspace' },
    warehouse:   { title: 'Choose a Warehouse', sub: 'All pipeline SQL runs on this warehouse' },
    schemas:     { title: 'Add Schemas', sub: 'Pick schemas to sync (you can add more later)' },
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] max-h-[90vh] overflow-y-auto bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3c3c] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[#cccccc]">{screenTitles[screen].title}</p>
            <p className="text-[11px] text-[#6a6a6a] mt-0.5">{screenTitles[screen].sub}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {(['credentials', 'warehouse', 'schemas'] as Screen[]).map((s, i) => (
                <div key={s} className={clsx(
                  'rounded-full transition-all',
                  screen === s ? 'w-4 h-1.5 bg-[#4ec9b0]' : 'w-1.5 h-1.5 bg-[#3c3c3c]'
                )} aria-label={`Step ${i + 1}`} />
              ))}
            </div>
            <button type="button" onClick={onClose} title="Close"
              className="text-[#6a6a6a] hover:text-[#cccccc] transition-colors p-1 rounded">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">

          {/* ── SCREEN 1: Credentials ── */}
          {screen === 'credentials' && (
            <>
              <Field label="Workspace URL" value={workspaceUrl} autoFocus
                onChange={v => { setWorkspaceUrl(v); setCredError(null) }}
                placeholder="https://adb-xxxx.azuredatabricks.net" />

              <Field label="Connection Name" value={connName}
                onChange={handleNameChange}
                placeholder="e.g. Production" />

              {/* Advanced: alias */}
              <div className="flex flex-col gap-1">
                <button type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1 text-[10px] text-[#4a4a4a] hover:text-[#6a6a6a] transition-colors w-fit">
                  <ChevronDown size={10} className={clsx('transition-transform', showAdvanced ? '' : '-rotate-90')} />
                  Advanced
                  {connAlias && !showAdvanced && (
                    <span className="ml-1 font-mono text-[#4a4a4a]">alias: {connAlias}</span>
                  )}
                </button>
                {showAdvanced && (
                  <div className="flex flex-col gap-1 mt-1 pl-3 border-l border-[#2d2d30]">
                    <label className="text-[11px] text-[#6a6a6a] font-semibold uppercase tracking-wider">Alias</label>
                    <input
                      type="text"
                      value={connAlias}
                      onChange={e => { setConnAlias(e.target.value); setAliasManual(true) }}
                      placeholder={slugify(connName) || 'e.g. production'}
                      className="border rounded px-2.5 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#0e639c] outline-none placeholder-[#4a4a4a]"
                    />
                    <span className="text-[10px] text-[#4a4a4a]">
                      Immutable slug used by pipeline source nodes.
                    </span>
                  </div>
                )}
              </div>

              {/* Auth method tabs */}
              <div className="flex border border-[#3c3c3c] rounded-lg overflow-hidden">
                {(['oauth', 'pat'] as AuthMethod[]).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => { setAuthMethod(method); setCredError(null) }}
                    className={clsx(
                      'flex-1 py-2 text-xs font-medium transition-colors',
                      authMethod === method
                        ? 'bg-[#2d2d30] text-[#cccccc]'
                        : 'text-[#6a6a6a] hover:text-[#969696]'
                    )}
                  >
                    {method === 'oauth' ? 'Sign in with Databricks' : 'Personal Access Token'}
                  </button>
                ))}
              </div>

              {/* OAuth option */}
              {authMethod === 'oauth' && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px] text-[#6a6a6a]">
                    Opens a Databricks login popup. Requires an OAuth app registered in your workspace.
                  </p>
                  {credError && (
                    <div className="flex items-start gap-2 text-[11px] text-[#f44747] bg-[#3a1e1e] border border-[#5a2e2e] rounded px-3 py-2.5">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      <span>{credError}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!canConnectOAuth || credLoading}
                    onClick={startOAuth}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full py-2.5 text-sm rounded-lg font-medium transition-colors',
                      canConnectOAuth && !credLoading
                        ? 'bg-[#ff3621] text-white hover:bg-[#e8301d]'
                        : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                    )}
                  >
                    {credLoading
                      ? <><Loader2 size={14} className="animate-spin" /> Waiting for sign-in…</>
                      : 'Sign in with Databricks'}
                  </button>
                </div>
              )}

              {/* PAT option */}
              {authMethod === 'pat' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-[#6a6a6a] font-semibold uppercase tracking-wider">
                        Personal Access Token
                      </label>
                      <a
                        href={workspaceUrl.startsWith('https://') ? `${workspaceUrl.replace(/\/$/, '')}#settings/account` : '#'}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-[#4ec9b0] hover:underline flex items-center gap-0.5"
                        onClick={e => { if (!workspaceUrl.startsWith('https://')) e.preventDefault() }}
                      >
                        Get token <ExternalLink size={9} />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={pat}
                      onChange={e => { setPat(e.target.value); setCredError(null) }}
                      placeholder="dapi••••••••••••••••"
                      autoComplete="off"
                      spellCheck={false}
                      className="border rounded px-2.5 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#0e639c] outline-none placeholder-[#4a4a4a] transition-colors"
                    />
                    <span className="text-[10px] text-[#4a4a4a]">
                      Workspace → avatar → Settings → Developer → Access tokens
                    </span>
                  </div>

                  {credError && (
                    <div className="flex items-start gap-2 text-[11px] text-[#f44747] bg-[#3a1e1e] border border-[#5a2e2e] rounded px-3 py-2.5">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      <span>{credError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!canConnectPAT || credLoading}
                    onClick={connectWithPAT}
                    className={clsx(
                      'flex items-center justify-center gap-2 w-full py-2.5 text-sm rounded-lg font-medium transition-colors',
                      canConnectPAT && !credLoading
                        ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                        : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                    )}
                  >
                    {credLoading
                      ? <><Loader2 size={14} className="animate-spin" /> Connecting…</>
                      : 'Connect'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── SCREEN 2: Warehouse ── */}
          {screen === 'warehouse' && (
            <>
              <div className="flex items-center gap-2 text-[12px] text-[#4ec9b0] bg-[#1e3a2b] border border-[#2d5a40] rounded-lg px-3 py-2.5">
                <CheckCircle2 size={14} />
                Connected to {workspaceUrl.replace('https://', '')}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] text-[#6a6a6a] font-semibold uppercase tracking-wider">
                  SQL Warehouse
                </label>
                {warehouses.length === 0 ? (
                  <p className="text-xs text-[#f44747] py-1">No SQL warehouses found in this workspace.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {warehouses.map(w => (
                      <label key={w.id}
                        className={clsx(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                          selectedWarehouse === w.id
                            ? 'border-[#4ec9b0] bg-[#1e3a2b]'
                            : 'border-[#2d2d30] bg-[#1a1a1a] hover:border-[#3c3c3c]'
                        )}
                      >
                        <input type="radio" name="warehouse" value={w.id}
                          checked={selectedWarehouse === w.id}
                          onChange={() => setSelectedWarehouse(w.id)}
                          className="accent-[#4ec9b0]" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#cccccc] font-medium truncate">{w.name}</p>
                          <p className="text-[10px] text-[#6a6a6a]">{w.cluster_size}</p>
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
              </div>

              {/* Upload location — optional */}
              <details className="group">
                <summary className="cursor-pointer text-[11px] text-[#6a6a6a] hover:text-[#969696] transition-colors list-none flex items-center gap-1.5">
                  <ChevronDown size={11} className="transition-transform group-open:rotate-0 -rotate-90" />
                  CSV upload location <span className="text-[#4a4a4a]">(optional)</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3 pl-1">
                  <p className="text-[11px] text-[#4a4a4a]">
                    Where CSV files are staged before loading into Delta tables.
                  </p>
                  <Field label="Catalog" value={uploadCatalog} onChange={setUploadCatalog} placeholder="main" />
                  <Field label="Schema" value={uploadSchema} onChange={setUploadSchema} placeholder="uploads" />
                  <Field label="Volume" value={uploadVolume} onChange={setUploadVolume} placeholder="csv_staging"
                    hint="Unity Catalog volume name." />
                </div>
              </details>

              {warehouseError && (
                <div className="flex items-start gap-2 text-[11px] text-[#f44747] bg-[#3a1e1e] border border-[#5a2e2e] rounded px-3 py-2">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {warehouseError}
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <button type="button" onClick={() => setScreen('credentials')}
                  className="text-xs text-[#6a6a6a] hover:text-[#969696] transition-colors px-3 py-2">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={saveWarehouse}
                  disabled={!selectedWarehouse || warehouseSaving}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg font-medium transition-colors',
                    selectedWarehouse && !warehouseSaving
                      ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3ab89e]'
                      : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                  )}
                >
                  {warehouseSaving && <Loader2 size={14} className="animate-spin" />}
                  Next: Add Schemas →
                </button>
              </div>
            </>
          )}

          {/* ── SCREEN 3: Schemas ── */}
          {screen === 'schemas' && connectionId && (
            <SchemaPicker
              connectionId={connectionId}
              onDone={onClose}
              onSkip={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
