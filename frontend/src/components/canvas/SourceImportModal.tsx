/**
 * SourceImportModal — unified "Add Source" sheet.
 *
 * Local File tab:  1-step: drop CSV → pick destination (catalog.schema searchable
 *                  dropdown + volume picker) → Upload & Add to Canvas
 * Databricks tab:  catalog/schema tree picker → sync → tables appear in left panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Upload,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  AlertCircle,
  Database,
  Settings,
  HelpCircle,
  Plus,
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { api } from '../../services/api'
import type { ColumnType, DatabricksConnection } from '../../types'
import clsx from 'clsx'
import { makeNodeId } from '../../constants/nodeDefaults'
import { DatabricksConnectModal } from '../settings/DatabricksConnectModal'

type Tab = 'local' | 'databricks'

interface Props {
  onClose: () => void
  position?: { x: number; y: number }
  onSchemaDone?: () => void
  defaultTab?: Tab
}

// ── Searchable catalog.schema picker ─────────────────────────────────────────

interface SchemaEntry {
  catalog: string
  schema: string
}

function CatalogSchemaSearch({
  connectionId,
  value,
  onSelect,
}: {
  connectionId: string
  value: string // "catalog.schema" or ""
  onSelect: (catalog: string, schema: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<SchemaEntry[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [open])

  // Load ALL catalogs + all their schemas when dropdown first opens
  useEffect(() => {
    if (!open || entries.length > 0) return
    setLoading(true)
    api
      .listCatalogs(connectionId)
      .then(async ({ data: cats }) => {
        const results: SchemaEntry[] = []
        await Promise.all(
          cats.map(async (cat) => {
            try {
              const { data: schemas } = await api.listSchemas(connectionId, cat.name)
              schemas.forEach((s) => results.push({ catalog: cat.name, schema: s.name }))
            } catch {
              /* skip inaccessible catalog */
            }
          })
        )
        setEntries(results)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, connectionId, entries.length])

  // Filter entries by query (matches catalog OR schema)
  const filtered = useMemo(() => {
    if (!query) return entries
    const q = query.toLowerCase()
    return entries.filter(
      (e) => e.catalog.toLowerCase().includes(q) || e.schema.toLowerCase().includes(q)
    )
  }, [entries, query])

  // Group filtered results by catalog
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const e of filtered) {
      const list = map.get(e.catalog) ?? []
      list.push(e.schema)
      map.set(e.catalog, list)
    }
    return map
  }, [filtered])

  const handleSelect = (catalog: string, schema: string) => {
    onSelect(catalog, schema)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={clsx(
          'w-full flex items-center justify-between px-2.5 py-2 rounded border text-xs transition-colors text-left',
          open
            ? 'border-[var(--accent)] bg-[var(--bg-input)]'
            : 'border-[var(--border)] bg-[var(--bg-input)] hover:border-[var(--text-3)]'
        )}
      >
        <span className={value ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}>
          {value || 'Select catalog.schema…'}
        </span>
        <ChevronDown
          size={12}
          className={clsx(
            'text-[var(--text-3)] transition-transform shrink-0',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="schema-dropdown absolute left-0 right-0 top-full mt-1 z-[300] rounded-lg shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="schema-dropdown-search px-2 pt-2 pb-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search catalog or schema…"
              className="w-full px-2 py-1.5 text-xs rounded bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-3)] outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>

          {/* Results */}
          <div className="overflow-y-auto max-h-52 py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-3)]">
                <Loader2 size={12} className="animate-spin" /> Loading schemas…
              </div>
            ) : grouped.size === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--text-3)] text-center">
                {query ? 'No matches found.' : 'No schemas available.'}
              </p>
            ) : (
              Array.from(grouped.entries()).map(([catalog, schemas]) => (
                <div key={catalog}>
                  {/* Catalog header */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    <Database size={9} className="text-[var(--success)]" />
                    {catalog}
                  </div>
                  {/* Schemas */}
                  {schemas.map((schema) => (
                    <button
                      key={schema}
                      type="button"
                      onClick={() => handleSelect(catalog, schema)}
                      className="w-full text-left flex items-center gap-2 pl-7 pr-3 py-1.5 text-xs text-[var(--text-1)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <span className="text-[var(--text-3)]">—</span>
                      <span>{schema}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Volume dropdown ───────────────────────────────────────────────────────────

function VolumeSelect({
  connectionId,
  catalog,
  schema,
  value,
  onSelect,
}: {
  connectionId: string
  catalog: string
  schema: string
  value: string
  onSelect: (vol: string) => void
}) {
  const [volumes, setVolumes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [showTip, setShowTip] = useState(false)
  // Inline create-volume state
  const [creating, setCreating] = useState(false)
  const [newVolName, setNewVolName] = useState('csv_staging')
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)

  const loadVolumes = useCallback(() => {
    setLoading(true)
    api
      .listVolumes(connectionId, catalog, schema)
      .then(({ data }) => {
        const names = data.map((v) => v.name)
        setVolumes(names)
        if (names.length === 1 && !value) onSelect(names[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, catalog, schema])

  useEffect(() => {
    if (!catalog || !schema) return
    setVolumes([])
    setCreating(false)
    setCreateErr(null)
    loadVolumes()
  }, [catalog, schema, loadVolumes])

  const handleCreate = useCallback(async () => {
    if (!newVolName.trim()) return
    setCreateBusy(true)
    setCreateErr(null)
    try {
      await api.createVolume(connectionId, catalog, schema, newVolName.trim())
      setCreating(false)
      // Reload and auto-select the newly created volume
      const { data } = await api.listVolumes(connectionId, catalog, schema)
      const names = data.map((v) => v.name)
      setVolumes(names)
      onSelect(newVolName.trim())
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCreateErr(detail ?? 'Failed to create volume')
    } finally {
      setCreateBusy(false)
    }
  }, [connectionId, catalog, schema, newVolName, onSelect])

  if (!catalog || !schema) return null

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-[var(--text-3)] uppercase font-semibold">
          Staging Volume
        </label>
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
            title="What is a volume?"
          >
            <HelpCircle size={11} />
          </button>
          {showTip && (
            <div className="vol-tip absolute left-4 -top-1 z-[400] w-60 px-2.5 py-2 rounded-lg shadow-xl text-[10px] leading-relaxed">
              A <strong>Volume</strong> is a Unity Catalog folder for storing files. Your CSV is
              staged here temporarily before being loaded as a Delta table. The volume is only a
              staging area — your final table goes to{' '}
              <strong>
                {catalog}.{schema}
              </strong>
              .
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[var(--text-3)] border border-[var(--border)] rounded bg-[var(--bg-input)]">
          <Loader2 size={11} className="animate-spin" /> Loading volumes…
        </div>
      ) : volumes.length === 0 && !creating ? (
        /* No volumes — offer to create one right here */
        <div className="flex flex-col gap-2 px-2.5 py-2.5 rounded border border-[var(--node-filter-border)] bg-[var(--node-filter-bg)]">
          <div className="flex items-start gap-2">
            <AlertCircle size={12} className="text-[var(--warning)] shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--warning)] leading-relaxed">
              No volumes found in{' '}
              <strong>
                {catalog}.{schema}
              </strong>
              . A staging volume is needed to upload CSV files.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-[11px] font-medium px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors w-fit"
          >
            Create a volume here
          </button>
        </div>
      ) : creating ? (
        /* Inline volume name input + confirm */
        <div className="flex flex-col gap-2 px-2.5 py-2.5 rounded border border-[var(--border)] bg-[var(--bg-input)]">
          <p className="text-[10px] text-[var(--text-2)]">
            Name your staging volume in{' '}
            <strong>
              {catalog}.{schema}
            </strong>
            :
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newVolName}
              onChange={(e) => setNewVolName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              placeholder="csv_staging"
              className="flex-1 px-2 py-1.5 text-xs rounded border bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-1)] focus:border-[var(--accent)] outline-none placeholder-[var(--text-3)]"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createBusy || !newVolName.trim()}
              className={clsx(
                'px-3 py-1.5 text-xs rounded font-medium transition-colors shrink-0',
                !createBusy && newVolName.trim()
                  ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-3)] cursor-not-allowed'
              )}
            >
              {createBusy ? <Loader2 size={11} className="animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setCreateErr(null)
              }}
              className="icon-button"
              title="Cancel"
            >
              <X size={12} />
            </button>
          </div>
          {createErr && <p className="text-[10px] text-[var(--warning)]">{createErr}</p>}
        </div>
      ) : (
        /* Volumes exist — dropdown */
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onSelect(e.target.value)}
            title="Select staging volume"
            className="flex-1 px-2 py-1.5 text-xs rounded border bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-1)] focus:border-[var(--accent)] outline-none"
          >
            {!value && <option value="">Select a volume…</option>}
            {volumes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setNewVolName('csv_staging')
            }}
            className="icon-button shrink-0"
            title="Create a new volume"
          >
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Local File tab — single-step ──────────────────────────────────────────────

function LocalFileTab({
  onClose,
  position,
  onSchemaDone,
}: {
  onClose: () => void
  position?: { x: number; y: number }
  onSchemaDone?: () => void
}) {
  const { addNode, nodes, connections, pipelineConnectionAlias, setPipelineConnectionAlias } =
    useTransformationStore()

  const conn =
    connections.find((c) => c.alias === (pipelineConnectionAlias ?? connections[0]?.alias)) ??
    connections[0] ??
    null

  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Destination
  const [catalog, setCatalog] = useState('')
  const [schema, setSchema] = useState('')
  const [volume, setVolume] = useState('')
  const [tableName, setTableName] = useState('')

  // When a file is staged, derive table name from filename
  const stageFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported.')
      return
    }
    setError(null)
    setFile(f)
    setTableName(
      f.name
        .replace(/\.csv$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 63)
    )
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) stageFile(f)
    },
    [stageFile]
  )
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) stageFile(f)
      e.target.value = ''
    },
    [stageFile]
  )

  const handleSchemaSelect = (c: string, s: string) => {
    setCatalog(c)
    setSchema(s)
    setVolume('')
  }

  const canUpload = !!(file && conn && catalog && schema && volume && tableName.trim())

  const doUpload = useCallback(async () => {
    if (!file || !conn || !canUpload) return
    setUploading(true)
    setError(null)
    try {
      // Save volume config in background for future convenience (non-blocking, non-fatal)
      if (
        catalog !== conn.upload_catalog ||
        schema !== conn.upload_schema ||
        volume !== conn.upload_volume
      ) {
        api
          .updateConnection(conn.id, {
            upload_catalog: catalog,
            upload_schema: schema,
            upload_volume: volume,
          })
          .then(({ data: updated }) => {
            const { setConnections, connections: conns } = useTransformationStore.getState()
            setConnections(conns.map((c) => (c.id === updated.id ? updated : c)))
          })
          .catch(() => {
            /* non-fatal — upload proceeds with volume passed explicitly */
          })
      }

      // Always pass volume explicitly — backend does NOT depend on saved connection config
      const { data } = await api.uploadCSV(conn.id, file, {
        targetCatalog: catalog,
        targetSchema: schema,
        tableName: tableName.trim(),
        uploadVolume: volume,
      })
      if (!pipelineConnectionAlias) setPipelineConnectionAlias(conn.alias)
      const tbl = data.table_ref.split('.').pop() ?? data.table_ref
      const pos = position ?? {
        x: 200 + nodes.filter((n) => n.type === 'source').length * 60,
        y: 200,
      }
      addNode({
        id: makeNodeId(),
        type: 'source',
        label: tbl,
        tableRef: data.table_ref,
        connection_alias: conn.alias,
        sourceType: 'csv',
        columns: (data.columns as { name: string; type: string; nullable: boolean }[]).map((c) => ({
          name: c.name,
          type: c.type as ColumnType,
          nullable: c.nullable,
        })),
        config: null,
        position: pos,
      })

      // Ensure the target schema is tracked + trigger a cache sync so the
      // new table appears in the left panel (CachedTreeBrowser polls until done).
      api.addSchema(conn.id, catalog, schema).catch(() => {
        /* already added — fine */
      })
      api.syncSchemas(conn.id).catch(() => {
        /* non-fatal */
      })
      onSchemaDone?.() // increment treeKey → CachedTreeBrowser reloads + polls

      onClose()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (e instanceof Error ? e.message : 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }, [
    file,
    conn,
    canUpload,
    catalog,
    schema,
    volume,
    tableName,
    addNode,
    nodes,
    position,
    onClose,
    pipelineConnectionAlias,
    setPipelineConnectionAlias,
  ])

  if (!conn) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle size={20} className="text-[var(--warning)]" />
        <p className="text-xs text-[var(--text-2)]">No Databricks connection configured.</p>
        <p className="text-[11px] text-[var(--text-3)]">
          Switch to the Databricks tab to connect first.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Drop zone ── */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !file && fileRef.current?.click()}
        className={clsx(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors',
          file ? 'py-2 cursor-default' : 'h-28 cursor-pointer',
          dragging
            ? 'border-[var(--pipe-stroke)] bg-[var(--accent)]/10'
            : file
              ? 'border-[var(--success)]/50 bg-[var(--node-output-bg)]'
              : 'border-[var(--border)] hover:border-[var(--text-3)] hover:bg-[var(--bg-elevated)]'
        )}
      >
        {file ? (
          <div className="flex items-center gap-2 px-3 py-1 w-full">
            <FileSpreadsheet size={14} className="text-[var(--success)] shrink-0" />
            <span className="text-xs text-[var(--text-1)] truncate flex-1">{file.name}</span>
            <span className="text-[10px] text-[var(--text-3)] shrink-0">
              {(file.size / 1_048_576).toFixed(1)} MB
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
                setTableName('')
                setError(null)
              }}
              className="text-[var(--text-3)] hover:text-[var(--text-1)] shrink-0"
              title="Remove file"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <div
              className={clsx(
                'w-9 h-9 rounded-full flex items-center justify-center',
                dragging ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-elevated)]'
              )}
            >
              {dragging ? (
                <Upload size={16} className="text-[var(--pipe-stroke)]" />
              ) : (
                <FileSpreadsheet size={16} className="text-[var(--warning)]" />
              )}
            </div>
            <p className="text-xs text-[var(--text-2)]">
              {dragging ? 'Drop CSV to import' : 'Drag & drop CSV, or click to browse'}
            </p>
            <p className="text-[11px] text-[var(--text-3)]">Supported: .csv</p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={onFileInput}
        className="hidden"
        aria-label="Upload CSV file"
      />

      {/* ── Destination ── */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
          Destination
        </p>

        {/* Catalog.Schema searchable dropdown */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-[var(--text-3)] uppercase font-semibold">
            Catalog . Schema
          </label>
          <CatalogSchemaSearch
            connectionId={conn.id}
            value={catalog && schema ? `${catalog}.${schema}` : ''}
            onSelect={handleSchemaSelect}
          />
        </div>

        {/* Volume — appears after schema selected, auto-loads */}
        {catalog && schema && (
          <VolumeSelect
            connectionId={conn.id}
            catalog={catalog}
            schema={schema}
            value={volume}
            onSelect={setVolume}
          />
        )}

        {/* Table name */}
        {catalog && schema && volume && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-[var(--text-3)] uppercase font-semibold">
              Table Name
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="my_table"
              className="w-full px-2 py-1.5 text-xs rounded border bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-1)] focus:border-[var(--success)] outline-none placeholder-[var(--text-3)]"
            />
            {catalog && schema && tableName && (
              <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                Creates{' '}
                <span className="font-mono text-[var(--text-2)]">
                  {catalog}.{schema}.{tableName}
                </span>{' '}
                as a Delta table.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-[var(--warning)] bg-[var(--node-filter-bg)] border border-[var(--node-filter-border)] rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={doUpload}
        disabled={!canUpload || uploading}
        className={clsx(
          'flex items-center justify-center gap-2 w-full py-2.5 text-sm rounded-lg font-medium transition-colors',
          canUpload && !uploading
            ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
            : 'bg-[var(--bg-elevated)] text-[var(--text-3)] cursor-not-allowed'
        )}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Uploading…
          </>
        ) : (
          'Upload & Add to Canvas'
        )}
      </button>
    </div>
  )
}

// ── Databricks schema picker ──────────────────────────────────────────────────

interface CatalogEntry {
  name: string
  schemas?: string[]
  loading?: boolean
  expanded?: boolean
}

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
    Promise.all([api.listCatalogs(connection.id), api.getSelectedSchemas(connection.id)])
      .then(([catsRes, selRes]) => {
        setCatalogs(catsRes.data.map((c) => ({ name: c.name })))
        setAlreadySelected(new Set(selRes.data.map((s) => `${s.catalog}.${s.schema}`)))
      })
      .catch(() => setError('Failed to load catalogs'))
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
    if (alreadySelected.has(key)) return
    setSelected((prev) => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const addSchemas = useCallback(async () => {
    if (selected.size === 0) {
      onDone()
      return
    }
    setAdding(true)
    setError(null)
    try {
      await Promise.all(
        Array.from(selected).map((key) => {
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
      <div className="flex items-center gap-2 py-8 justify-center text-xs text-[var(--text-3)]">
        <Loader2 size={13} className="animate-spin" /> Loading catalogs…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[var(--text-3)]">
        Pick schemas to sync. Tables &amp; columns are cached locally — drag them onto the canvas
        instantly.
      </p>

      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="max-h-[260px] overflow-y-auto px-2 py-2">
          {catalogs.length === 0 ? (
            <p className="py-4 text-xs text-[var(--text-3)] text-center">No catalogs found.</p>
          ) : (
            catalogs.map((cat, idx) => (
              <div key={cat.name}>
                <div
                  onClick={() => expandCatalog(idx)}
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[var(--bg-elevated)] rounded text-xs font-medium text-[var(--text-1)]"
                >
                  <span className="w-3 text-[var(--text-3)]">
                    {cat.loading ? (
                      <Loader2 size={9} className="animate-spin" />
                    ) : cat.expanded ? (
                      <ChevronDown size={9} />
                    ) : (
                      <ChevronRight size={9} />
                    )}
                  </span>
                  <Database size={10} className="text-[var(--success)] shrink-0" />
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
                              ? 'text-[var(--text-3)] cursor-default'
                              : 'text-[var(--text-1)] cursor-pointer hover:bg-[var(--bg-elevated)]'
                          )}
                        >
                          {checked ? (
                            <CheckSquare
                              size={12}
                              className={already ? 'text-[var(--text-3)]' : 'text-[var(--success)]'}
                            />
                          ) : (
                            <Square size={12} className="text-[var(--text-3)]" />
                          )}
                          <span>{schema}</span>
                          {already && (
                            <span className="ml-auto text-[9px] text-[var(--text-3)]">added</span>
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
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--warning)]">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-3)]">
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
              ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-3)] cursor-not-allowed'
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

export function SourceImportModal({
  onClose,
  position,
  onSchemaDone,
  defaultTab = 'local',
}: Props) {
  const { connections } = useTransformationStore()

  const [tab, setTab] = useState<Tab>(defaultTab)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const [activeConnId, setActiveConnId] = useState<string | null>(null)
  const activeConn: DatabricksConnection | null =
    connections.find((c) => c.id === activeConnId) ?? connections[0] ?? null

  const handleSchemaDone = useCallback(() => {
    onSchemaDone?.()
    onClose()
  }, [onSchemaDone, onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="w-[480px] max-h-[90vh] overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-surface)] z-10">
            <span className="text-sm font-semibold text-[var(--text-1)]">Add Source</span>
            <button type="button" onClick={onClose} className="icon-button" title="Close">
              <X size={14} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {[
              { id: 'local' as Tab, label: 'Local File' },
              { id: 'databricks' as Tab, label: 'Databricks' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={clsx(
                  'px-4 py-2 text-xs border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-[var(--accent)] text-[var(--text-1)]'
                    : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-4">
            {tab === 'local' && (
              <LocalFileTab onClose={onClose} position={position} onSchemaDone={onSchemaDone} />
            )}

            {tab === 'databricks' && (
              <div className="flex flex-col gap-3">
                {connections.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-[var(--node-output-bg)] flex items-center justify-center">
                      <Database size={18} className="text-[var(--success)]" />
                    </div>
                    <p className="text-xs text-[var(--text-2)] font-medium">
                      No Databricks connection
                    </p>
                    <p className="text-[11px] text-[var(--text-3)] max-w-xs">
                      Connect a Databricks workspace to browse Unity Catalog tables.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowConnectModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      <Settings size={12} />
                      Connect Databricks
                    </button>
                  </div>
                ) : (
                  <>
                    {connections.length > 1 && (
                      <div className="flex gap-1 flex-wrap">
                        {connections.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveConnId(c.id)}
                            className={clsx(
                              'px-2.5 py-1 text-[11px] rounded border transition-colors',
                              activeConn?.id === c.id
                                ? 'border-[var(--success)] text-[var(--success)] bg-[var(--node-output-bg)]'
                                : 'border-[var(--border)] text-[var(--text-3)] hover:border-[var(--text-2)]'
                            )}
                          >
                            {c.name || c.alias}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeConn && (
                      <SchemaPicker connection={activeConn} onDone={handleSchemaDone} />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowConnectModal(true)}
                      className="flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors w-fit"
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

      {showConnectModal && <DatabricksConnectModal onClose={() => setShowConnectModal(false)} />}
    </>
  )
}
