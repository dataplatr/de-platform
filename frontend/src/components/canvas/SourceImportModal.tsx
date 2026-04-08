/**
 * SourceImportModal — unified "Add Source" sheet.
 *
 * Local File tab:  CSV drag-and-drop → uploads to Databricks → adds canvas node.
 * Databricks tab:  catalog/schema picker → syncs metadata → tables appear in left panel.
 *
 * Opened from:
 *   - ObjectNavigator "+" button  (passes onSchemaDone so tree refreshes)
 *   - CanvasToolbar "Source" button  (no onSchemaDone needed)
 *   - Right-click canvas  (passes position for node placement)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Upload, FileSpreadsheet, Loader2, ChevronDown, ChevronRight,
  CheckSquare, Square, AlertCircle, Database, Settings,
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { api } from '../../services/api'
import type { ColumnType, DatabricksConnection } from '../../types'
import clsx from 'clsx'
import { makeNodeId } from '../../constants/nodeDefaults'
import { DatabricksConnectModal } from '../settings/DatabricksConnectModal'

type Tab = 'local' | 'databricks'

const MAX_WARN_MB = 100

interface Props {
  onClose: () => void
  /** If provided the node lands at this canvas position (Local File tab) */
  position?: { x: number; y: number }
  /** Called after schemas are added so the navigator tree refreshes */
  onSchemaDone?: () => void
  /** Pre-select this tab when opening */
  defaultTab?: Tab
}

// ── Inline schema picker (Databricks tab content) ─────────────────────────────

interface CatalogEntry { name: string; schemas?: string[]; loading?: boolean; expanded?: boolean }

function SchemaPicker({
  connection,
  onDone,
}: {
  connection: DatabricksConnection
  onDone: () => void
}) {
  const [catalogs, setCatalogs] = useState<CatalogEntry[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [alreadySelected, setAlreadySelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.listCatalogs(connection.id),
      api.getSelectedSchemas(connection.id),
    ]).then(([catsRes, selRes]) => {
      setCatalogs(catsRes.data.map(c => ({ name: c.name })))
      setAlreadySelected(new Set(selRes.data.map(s => `${s.catalog}.${s.schema}`)))
    }).catch(() => setError('Failed to load catalogs'))
      .finally(() => setCatalogsLoading(false))
  }, [connection.id])

  const expandCatalog = useCallback(async (idx: number) => {
    const cat = catalogs[idx]
    if (cat.schemas) {
      setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, expanded: !c.expanded } : c))
      return
    }
    setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, loading: true } : c))
    try {
      const { data } = await api.listSchemas(connection.id, cat.name)
      setCatalogs(prev => prev.map((c, i) =>
        i === idx ? { ...c, schemas: data.map(s => s.name), loading: false, expanded: true } : c
      ))
    } catch {
      setCatalogs(prev => prev.map((c, i) => i === idx ? { ...c, loading: false } : c))
    }
  }, [catalogs, connection.id])

  const toggle = (catalog: string, schema: string) => {
    const key = `${catalog}.${schema}`
    if (alreadySelected.has(key)) return
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  const addSchemas = useCallback(async () => {
    if (selected.size === 0) { onDone(); return }
    setAdding(true)
    setError(null)
    try {
      await Promise.all(
        Array.from(selected).map(key => {
          const [catalog, ...rest] = key.split('.')
          return api.addSchema(connection.id, catalog, rest.join('.'))
        })
      )
      onDone()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to add schemas')
      setAdding(false)
    }
  }, [selected, connection.id, onDone])

  if (catalogsLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-xs text-[#6a6a6a]">
        <Loader2 size={13} className="animate-spin" /> Loading catalogs…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#6a6a6a]">
        Pick schemas to sync. Tables &amp; columns are cached locally — drag them onto the canvas instantly.
      </p>

      {/* Catalog tree */}
      <div className="border border-[#3c3c3c] rounded-lg overflow-hidden">
        <div className="max-h-[260px] overflow-y-auto px-2 py-2">
          {catalogs.length === 0 ? (
            <p className="py-4 text-xs text-[#4a4a4a] text-center">No catalogs found.</p>
          ) : (
            catalogs.map((cat, idx) => (
              <div key={cat.name}>
                <div
                  onClick={() => expandCatalog(idx)}
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded text-xs font-medium text-[#cccccc]"
                >
                  <span className="w-3 text-[#6a6a6a]">
                    {cat.loading
                      ? <Loader2 size={9} className="animate-spin" />
                      : cat.expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                  </span>
                  <Database size={10} className="text-[#4ec9b0] shrink-0" />
                  <span className="uppercase">{cat.name}</span>
                </div>

                {cat.expanded && cat.schemas && (
                  <div className="ml-4">
                    {cat.schemas.map(schema => {
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
                          {checked
                            ? <CheckSquare size={12} className={already ? 'text-[#4a4a4a]' : 'text-[#4ec9b0]'} />
                            : <Square size={12} className="text-[#4a4a4a]" />}
                          <span>{schema}</span>
                          {already && <span className="ml-auto text-[9px] text-[#4a4a4a]">added</span>}
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

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#6a6a6a]">
          {selected.size > 0
            ? `${selected.size} schema${selected.size > 1 ? 's' : ''} selected`
            : 'Select schemas to add'}
        </span>
        <button
          type="button"
          onClick={addSchemas}
          disabled={adding}
          className={clsx(
            'flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-medium transition-colors',
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
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function SourceImportModal({ onClose, position, onSchemaDone, defaultTab = 'local' }: Props) {
  const { addNode, nodes, connections, pipelineConnectionAlias, setPipelineConnectionAlias } = useTransformationStore()

  const [tab, setTab] = useState<Tab>(defaultTab)
  const [showConnectModal, setShowConnectModal] = useState(false)

  // ── Active Databricks connection (for schema picker) ──────────────────────
  const [activeConnId, setActiveConnId] = useState<string | null>(null)
  const activeConn: DatabricksConnection | null =
    connections.find(c => c.id === activeConnId) ?? connections[0] ?? null

  // ── Local file state ──────────────────────────────────────────────────────
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Upload location config (inline fixer for missing volume)
  const uploadConn = connections.find(c => c.alias === (pipelineConnectionAlias ?? connections[0]?.alias)) ?? connections[0] ?? null
  const uploadMisconfigured = uploadConn && (!uploadConn.upload_catalog || !uploadConn.upload_schema || !uploadConn.upload_volume)
  const [fixCatalog, setFixCatalog] = useState(uploadConn?.upload_catalog ?? '')
  const [fixSchema,  setFixSchema]  = useState(uploadConn?.upload_schema  ?? '')
  const [fixVolume,  setFixVolume]  = useState(uploadConn?.upload_volume  ?? '')
  const [fixSaving,  setFixSaving]  = useState(false)

  // Per-upload destination fields (where the Delta table lands)
  const [destCatalog,   setDestCatalog]   = useState(uploadConn?.upload_catalog ?? '')
  const [destSchema,    setDestSchema]    = useState(uploadConn?.upload_schema  ?? '')
  const [destTableName, setDestTableName] = useState('')
  const [pendingFile,   setPendingFile]   = useState<File | null>(null)

  const saveUploadLocation = useCallback(async () => {
    if (!uploadConn || !fixCatalog.trim() || !fixSchema.trim() || !fixVolume.trim()) return
    setFixSaving(true)
    try {
      const { data: updated } = await api.updateConnection(uploadConn.id, {
        upload_catalog: fixCatalog.trim(),
        upload_schema:  fixSchema.trim(),
        upload_volume:  fixVolume.trim(),
      })
      // Refresh connection in store
      const { setConnections } = useTransformationStore.getState()
      setConnections(connections.map(c => c.id === updated.id ? updated : c))
      setError(null)
    } catch {
      setError('Failed to save upload location.')
    } finally {
      setFixSaving(false)
    }
  }, [uploadConn, fixCatalog, fixSchema, fixVolume, connections])

  // Stage a dropped/picked file — populate default table name, wait for user to confirm
  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported right now.')
      return
    }
    setError(null)
    const derived = file.name.replace(/\.csv$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 63)
    setDestTableName(derived)
    setPendingFile(file)
  }, [])

  // Actually upload once user confirms destination
  const doUpload = useCallback(async () => {
    const file = pendingFile
    const conn = connections.find(c => c.alias === (pipelineConnectionAlias ?? connections[0]?.alias)) ?? connections[0] ?? null
    if (!file || !conn) return
    if (!conn.upload_volume) {
      setError('Configure the upload location above before uploading.')
      return
    }
    if (!destCatalog.trim() || !destSchema.trim() || !destTableName.trim()) {
      setError('Catalog, schema, and table name are required.')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const { data } = await api.uploadCSV(conn.id, file, {
        targetCatalog: destCatalog.trim(),
        targetSchema:  destSchema.trim(),
        tableName:     destTableName.trim(),
      })
      if (!pipelineConnectionAlias) setPipelineConnectionAlias(conn.alias)
      const tableName = data.table_ref.split('.').pop() ?? data.table_ref
      const pos = position ?? { x: 200 + nodes.filter(n => n.type === 'source').length * 60, y: 200 }
      addNode({
        id: makeNodeId(),
        type: 'source',
        label: tableName,
        tableRef: data.table_ref,
        connection_alias: conn.alias,
        sourceType: 'csv',
        columns: (data.columns as { name: string; type: string; nullable: boolean }[]).map(c => ({
          name: c.name, type: c.type as ColumnType, nullable: c.nullable,
        })),
        config: null,
        position: pos,
      })
      onClose()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (e instanceof Error ? e.message : 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }, [pendingFile, destCatalog, destSchema, destTableName, addNode, nodes, position, onClose, connections, pipelineConnectionAlias, setPipelineConnectionAlias])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]; if (file) handleFile(file)
  }, [handleFile])
  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''
  }, [handleFile])

  const handleSchemaDone = useCallback(() => {
    onSchemaDone?.()
    onClose()
  }, [onSchemaDone, onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-[500px] bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
            <span className="text-sm font-semibold text-[#cccccc]">Add Source</span>
            <button type="button" onClick={onClose} className="icon-button" title="Close"><X size={14} /></button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#3c3c3c]">
            {([
              { id: 'local' as Tab,      label: 'Local File' },
              { id: 'databricks' as Tab, label: 'Databricks' },
            ]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setError(null) }}
                className={clsx(
                  'px-4 py-2 text-xs border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-[#0e639c] text-[#cccccc]'
                    : 'border-transparent text-[#6a6a6a] hover:text-[#969696]'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-4">

            {/* ── LOCAL FILE TAB ── */}
            {tab === 'local' && (
              <div className="flex flex-col gap-3">

                {/* No connection at all */}
                {!uploadConn && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <AlertCircle size={20} className="text-[#dcdcaa]" />
                    <p className="text-xs text-[#969696]">No Databricks connection configured.</p>
                    <p className="text-[11px] text-[#4a4a4a]">Switch to the Databricks tab to connect first.</p>
                  </div>
                )}

                {/* Upload location not configured — show inline fixer */}
                {uploadConn && uploadMisconfigured && (
                  <div className="flex flex-col gap-2 bg-[#2a1e0e] border border-[#5a4b2e] rounded-lg px-3 py-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={13} className="text-[#dcdcaa] shrink-0 mt-0.5" />
                      <p className="text-[11px] text-[#dcdcaa] leading-relaxed">
                        CSV uploads need a Unity Catalog volume to stage files.
                        Set the location for <span className="font-semibold">{uploadConn.name || uploadConn.alias}</span>:
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {[
                        { label: 'Catalog', value: fixCatalog, set: setFixCatalog, placeholder: 'main' },
                        { label: 'Schema',  value: fixSchema,  set: setFixSchema,  placeholder: 'uploads' },
                        { label: 'Volume',  value: fixVolume,  set: setFixVolume,  placeholder: 'csv_staging' },
                      ].map(f => (
                        <div key={f.label} className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-[#6a6a6a] font-semibold uppercase">{f.label}</label>
                          <input
                            type="text"
                            value={f.value}
                            onChange={e => f.set(e.target.value)}
                            placeholder={f.placeholder}
                            className="border rounded px-2 py-1 text-[11px] text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#0e639c] outline-none placeholder-[#4a4a4a]"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={saveUploadLocation}
                      disabled={fixSaving || !fixCatalog.trim() || !fixSchema.trim() || !fixVolume.trim()}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 w-full py-1.5 text-xs rounded font-medium transition-colors mt-1',
                        !fixSaving && fixCatalog && fixSchema && fixVolume
                          ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                          : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                      )}
                    >
                      {fixSaving && <Loader2 size={11} className="animate-spin" />}
                      Save Upload Location
                    </button>
                  </div>
                )}

                {/* Drop zone + destination form — shown when volume is configured */}
                {uploadConn && !uploadMisconfigured && (
                  <>
                    {/* Step 1: pick file */}
                    {!pendingFile && (
                      <div
                        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                        onClick={() => fileRef.current?.click()}
                        className={clsx(
                          'flex flex-col items-center justify-center gap-2 h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                          dragging ? 'border-[#4fc1ff] bg-[#1e3a5f]/30' : 'border-[#3c3c3c] hover:border-[#6a6a6a] hover:bg-[#2d2d30]'
                        )}
                      >
                        <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center', dragging ? 'bg-[#1e3a5f]' : 'bg-[#2d2d30]')}>
                          {dragging ? <Upload size={16} className="text-[#4fc1ff]" /> : <FileSpreadsheet size={16} className="text-[#dcdcaa]" />}
                        </div>
                        <p className="text-xs text-[#969696]">
                          {dragging ? 'Drop CSV to import' : 'Drag & drop CSV here, or click to browse'}
                        </p>
                        <p className="text-[11px] text-[#4a4a4a]">Supported: .csv</p>
                      </div>
                    )}

                    {/* Step 2: file chosen — show destination fields then Upload */}
                    {pendingFile && (
                      <div className="flex flex-col gap-3">
                        {/* File pill */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#1e3a2b] border border-[#2d5a40] rounded-lg">
                          <FileSpreadsheet size={14} className="text-[#4ec9b0] shrink-0" />
                          <span className="text-xs text-[#cccccc] truncate flex-1">{pendingFile.name}</span>
                          <span className="text-[10px] text-[#6a6a6a] shrink-0">
                            {(pendingFile.size / 1_048_576).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => { setPendingFile(null); setDestTableName(''); setError(null) }}
                            className="text-[#4a4a4a] hover:text-[#969696] shrink-0"
                            title="Remove file"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        {/* Destination */}
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[11px] text-[#6a6a6a] font-semibold uppercase tracking-wider">
                            Save table to
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] text-[#4a4a4a] uppercase">Catalog</label>
                              <input
                                type="text"
                                value={destCatalog}
                                onChange={e => setDestCatalog(e.target.value)}
                                placeholder={uploadConn.upload_catalog || 'main'}
                                className="border rounded px-2 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#4ec9b0] outline-none placeholder-[#4a4a4a]"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] text-[#4a4a4a] uppercase">Schema</label>
                              <input
                                type="text"
                                value={destSchema}
                                onChange={e => setDestSchema(e.target.value)}
                                placeholder={uploadConn.upload_schema || 'uploads'}
                                className="border rounded px-2 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#4ec9b0] outline-none placeholder-[#4a4a4a]"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] text-[#4a4a4a] uppercase">Table Name</label>
                            <input
                              type="text"
                              value={destTableName}
                              onChange={e => setDestTableName(e.target.value)}
                              placeholder="my_table"
                              className="border rounded px-2 py-1.5 text-xs text-[#cccccc] bg-[#1e1e1e] border-[#3c3c3c] focus:border-[#4ec9b0] outline-none placeholder-[#4a4a4a]"
                            />
                          </div>
                          <p className="text-[10px] text-[#4a4a4a]">
                            Creates <span className="font-mono text-[#6a6a6a]">
                              {destCatalog || '…'}.{destSchema || '…'}.{destTableName || '…'}
                            </span> as a Delta table.
                            Raw CSV staged to the <span className="font-mono">{uploadConn.upload_volume}</span> volume.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={doUpload}
                          disabled={uploading || !destCatalog.trim() || !destSchema.trim() || !destTableName.trim()}
                          className={clsx(
                            'flex items-center justify-center gap-2 w-full py-2.5 text-sm rounded-lg font-medium transition-colors',
                            !uploading && destCatalog && destSchema && destTableName
                              ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                              : 'bg-[#2d2d30] text-[#4a4a4a] cursor-not-allowed'
                          )}
                        >
                          {uploading
                            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                            : 'Upload & Add to Canvas'
                          }
                        </button>
                      </div>
                    )}

                    <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" aria-label="Upload CSV file" />
                  </>
                )}

                {error && (
                  <p className="text-[11px] text-[#dcdcaa] bg-[#3a2b1e] border border-[#5a4b2e] rounded px-3 py-2">
                    ⚠ {error}
                  </p>
                )}
              </div>
            )}

            {/* ── DATABRICKS TAB ── */}
            {tab === 'databricks' && (
              <div className="flex flex-col gap-3">

                {connections.length === 0 ? (
                  /* No connection yet */
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-[#1e3a2b] flex items-center justify-center">
                      <Database size={18} className="text-[#4ec9b0]" />
                    </div>
                    <p className="text-xs text-[#969696] font-medium">No Databricks connection</p>
                    <p className="text-[11px] text-[#4a4a4a] max-w-xs">
                      Connect a Databricks workspace to browse Unity Catalog tables.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowConnectModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0e639c] text-white hover:bg-[#1177bb] transition-colors"
                    >
                      <Settings size={12} />
                      Connect Databricks
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Connection selector (if multiple) */}
                    {connections.length > 1 && (
                      <div className="flex gap-1 flex-wrap">
                        {connections.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveConnId(c.id)}
                            className={clsx(
                              'px-2.5 py-1 text-[11px] rounded border transition-colors',
                              activeConn?.id === c.id
                                ? 'border-[#4ec9b0] text-[#4ec9b0] bg-[#1e3a2b]'
                                : 'border-[#3c3c3c] text-[#6a6a6a] hover:border-[#6a6a6a]'
                            )}
                          >
                            {c.name || c.alias}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Inline schema picker */}
                    {activeConn && (
                      <SchemaPicker connection={activeConn} onDone={handleSchemaDone} />
                    )}

                    {/* Add another connection */}
                    <button
                      type="button"
                      onClick={() => setShowConnectModal(true)}
                      className="flex items-center gap-1 text-[11px] text-[#4a4a4a] hover:text-[#6a6a6a] transition-colors w-fit"
                    >
                      <Settings size={10} />
                      Add another connection
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showConnectModal && (
        <DatabricksConnectModal onClose={() => setShowConnectModal(false)} />
      )}
    </>
  )
}
