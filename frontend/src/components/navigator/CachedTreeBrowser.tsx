/**
 * CachedTreeBrowser — instant Unity Catalog explorer backed by SQLite metadata cache.
 *
 * On mount: calls GET /cached-tables (SQLite read, <10ms) — no Databricks API call.
 * While any schema has synced_at=null: polls every 3s so tables appear progressively.
 * Tables include columns already → drag works immediately on first attempt.
 * "↻" per schema triggers a background re-sync from Databricks.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Loader2, RefreshCw, Table2 } from 'lucide-react'
import { api } from '../../services/api'
import type { DatabricksConnection } from '../../types'
import clsx from 'clsx'

interface CachedTable {
  catalog: string
  schema: string
  table_name: string
  table_type: string
  columns: { name: string; type: string; nullable: boolean }[]
  synced_at: string
}

interface SelectedSchema {
  catalog: string
  schema: string
  synced_at: string | null
}

// Group tables into catalog → schema → tables
function groupTables(tables: CachedTable[]): Map<string, Map<string, CachedTable[]>> {
  const result = new Map<string, Map<string, CachedTable[]>>()
  for (const t of tables) {
    if (!result.has(t.catalog)) result.set(t.catalog, new Map())
    const schemas = result.get(t.catalog)!
    if (!schemas.has(t.schema)) schemas.set(t.schema, [])
    schemas.get(t.schema)!.push(t)
  }
  return result
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ColTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    VARCHAR: 'text-[#9cdcfe]',
    INTEGER: 'text-[#b5cea8]',
    FLOAT: 'text-[#b5cea8]',
    DATE: 'text-[#ce9178]',
    TIMESTAMP: 'text-[#ce9178]',
    BOOLEAN: 'text-[#569cd6]',
  }
  const abbr: Record<string, string> = {
    VARCHAR: 'str',
    INTEGER: 'int',
    FLOAT: 'flt',
    DATE: 'date',
    TIMESTAMP: 'ts',
    BOOLEAN: 'bool',
  }
  return (
    <span className={clsx('text-[10px] font-mono shrink-0', colors[type] ?? 'text-[#6a6a6a]')}>
      {abbr[type] ?? type.toLowerCase().slice(0, 4)}
    </span>
  )
}

export function CachedTreeBrowser({
  connection,
  search = '',
}: {
  connection: DatabricksConnection
  search?: string
}) {
  const [tables, setTables] = useState<CachedTable[]>([])
  const [selectedSchemas, setSelectedSchemas] = useState<SelectedSchema[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingSchemas, setSyncingSchemas] = useState<Set<string>>(new Set())
  const [expandedCatalogs, setExpandedCatalogs] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  // ── Fetch + auto-expand ────────────────────────────────────────────────────
  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true)
      return api
        .getCachedTables(connection.id)
        .then(({ data }) => {
          setTables(data.tables)
          setSelectedSchemas(data.selected_schemas)
          if (!silent) {
            // Auto-expand all catalogs and schemas on first load
            const cats = new Set(data.selected_schemas.map((s) => s.catalog))
            const schs = new Set(data.selected_schemas.map((s) => `${s.catalog}.${s.schema}`))
            setExpandedCatalogs(cats)
            setExpandedSchemas(schs)
          }
          return data.selected_schemas
        })
        .catch(() => [] as SelectedSchema[])
        .finally(() => {
          if (!silent) setLoading(false)
        })
    },
    [connection.id]
  )

  useEffect(() => {
    load()
  }, [load])

  // ── Poll while any schema is still syncing (synced_at === null) ───────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const hasPending = selectedSchemas.some((s) => s.synced_at === null)

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => {
        load(true).then((schemas) => {
          const stillPending = schemas.some((s) => s.synced_at === null)
          if (!stillPending && pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        })
      }, 2500)
    }

    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [selectedSchemas, load])

  // ── Manual schema re-sync ──────────────────────────────────────────────────
  const syncSchema = useCallback(
    (catalog: string, schema: string) => {
      const key = `${catalog}.${schema}`
      setSyncingSchemas((prev) => new Set(prev).add(key))
      // Mark as pending in local state so polling kicks in
      setSelectedSchemas((prev) =>
        prev.map((s) =>
          s.catalog === catalog && s.schema === schema ? { ...s, synced_at: null } : s
        )
      )
      api.addSchema(connection.id, catalog, schema).catch(() => {})
      setTimeout(() => {
        load(true).then(() => {
          setSyncingSchemas((prev) => {
            const s = new Set(prev)
            s.delete(key)
            return s
          })
        })
      }, 3000)
    },
    [connection.id, load]
  )

  const toggleCatalog = (cat: string) =>
    setExpandedCatalogs((prev) => {
      const s = new Set(prev)
      s.has(cat) ? s.delete(cat) : s.add(cat)
      return s
    })

  const toggleSchema = (key: string) =>
    setExpandedSchemas((prev) => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })

  const toggleTable = (key: string) =>
    setExpandedTables((prev) => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })

  const onDragStart = useCallback(
    (e: React.DragEvent, table: CachedTable) => {
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(
        'application/lakeflow-node',
        JSON.stringify({
          connectionAlias: connection.alias,
          tableRef: `${table.catalog}.${table.schema}.${table.table_name}`,
          label: table.table_name,
          sourceType: table.table_type === 'VIEW' ? 'view' : 'table',
          columns: table.columns,
        })
      )
    },
    [connection.alias]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-[#6a6a6a] text-xs">
        <Loader2 size={12} className="animate-spin" />
        Loading explorer…
      </div>
    )
  }

  if (selectedSchemas.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-[#4a4a4a]">
        No schemas selected. Click <span className="text-[#cccccc]">+</span> to add schemas.
      </div>
    )
  }

  const grouped = groupTables(tables)
  const allCatalogs = new Set([
    ...Array.from(grouped.keys()),
    ...selectedSchemas.map((s) => s.catalog),
  ])

  const searchLower = search.toLowerCase().trim()

  return (
    <div className="text-xs">
      {Array.from(allCatalogs)
        .sort()
        .map((catalog) => {
          const catExpanded = expandedCatalogs.has(catalog)
          const schemaMap = grouped.get(catalog) ?? new Map()
          const catalogSchemas = selectedSchemas.filter((s) => s.catalog === catalog)

          return (
            <div key={catalog}>
              {/* Catalog row */}
              <div
                onClick={() => toggleCatalog(catalog)}
                className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded-sm font-medium text-[#cccccc]"
              >
                <span className="w-3 shrink-0 text-[#6a6a6a]">
                  {catExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                </span>
                <Database size={11} className="text-[#4ec9b0] shrink-0" />
                <span className="uppercase truncate">{catalog}</span>
              </div>

              {catExpanded && (
                <div className="ml-3">
                  {catalogSchemas.map((ss) => {
                    const schKey = `${catalog}.${ss.schema}`
                    const allSchemaTables = schemaMap.get(ss.schema) ?? []
                    const schemaTables = searchLower
                      ? allSchemaTables.filter((t: CachedTable) =>
                          t.table_name.toLowerCase().includes(searchLower)
                        )
                      : allSchemaTables
                    const schExpanded =
                      expandedSchemas.has(schKey) ||
                      (searchLower.length > 0 && schemaTables.length > 0)
                    const manualSyncing = syncingSchemas.has(schKey)
                    const isSyncing = ss.synced_at === null || manualSyncing

                    return (
                      <div key={schKey}>
                        {/* Schema row */}
                        <div
                          className={clsx(
                            'flex items-center gap-1 group rounded-sm',
                            isSyncing && 'bg-[#1a2a1a]' // subtle green tint while syncing
                          )}
                        >
                          <div
                            onClick={() => toggleSchema(schKey)}
                            className="flex items-center gap-1 flex-1 px-2 py-0.5 cursor-pointer hover:bg-[#2d2d30] rounded-sm min-w-0"
                          >
                            <span className="w-3 shrink-0 text-[#6a6a6a]">
                              {schExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                            </span>
                            <span
                              className={clsx(
                                'truncate',
                                isSyncing ? 'text-[#4ec9b0]' : 'text-[#969696]'
                              )}
                            >
                              {ss.schema}
                            </span>

                            {isSyncing ? (
                              /* Syncing badge — bright and animated */
                              <span className="ml-auto flex items-center gap-1 shrink-0">
                                <Loader2 size={9} className="animate-spin text-[#4ec9b0]" />
                                <span className="text-[9px] text-[#4ec9b0] font-semibold animate-pulse">
                                  Syncing
                                </span>
                              </span>
                            ) : (
                              <span className="ml-auto text-[10px] text-[#4a4a4a] shrink-0">
                                {schemaTables.length}
                              </span>
                            )}
                          </div>

                          {/* Manual re-sync button — always visible while syncing, hover otherwise */}
                          <button
                            type="button"
                            title={`Re-sync ${catalog}.${ss.schema}`}
                            onClick={() => syncSchema(catalog, ss.schema)}
                            disabled={isSyncing}
                            className={clsx(
                              'shrink-0 px-1 py-0.5 transition-all rounded',
                              isSyncing
                                ? 'text-[#4ec9b0] opacity-100'
                                : 'text-[#4a4a4a] opacity-0 group-hover:opacity-100 hover:text-[#969696]'
                            )}
                          >
                            <RefreshCw size={9} className={clsx(isSyncing && 'animate-spin')} />
                          </button>
                        </div>

                        {/* Synced-at / syncing status line */}
                        <div
                          className={clsx(
                            'ml-1 text-[9px] pl-6 pb-0.5',
                            isSyncing ? 'text-[#4ec9b0]' : 'text-[#4a4a4a]'
                          )}
                        >
                          {isSyncing
                            ? `${schemaTables.length} table${schemaTables.length !== 1 ? 's' : ''} cached so far…`
                            : `synced ${timeAgo(ss.synced_at)}`}
                        </div>

                        {schExpanded && (
                          <div className="ml-3">
                            {/* Empty state inside schema */}
                            {schemaTables.length === 0 && (
                              <div
                                className={clsx(
                                  'px-2 py-1 text-[10px]',
                                  isSyncing ? 'text-[#4ec9b0] animate-pulse' : 'text-[#4a4a4a]'
                                )}
                              >
                                {isSyncing
                                  ? 'Fetching tables from Databricks…'
                                  : 'No tables cached yet'}
                              </div>
                            )}

                            {schemaTables.map((table: CachedTable) => {
                              const tKey = `${catalog}.${ss.schema}.${table.table_name}`
                              const tExpanded = expandedTables.has(tKey)

                              return (
                                <div key={tKey}>
                                  <div
                                    draggable
                                    onDragStart={(e) => onDragStart(e, table)}
                                    onClick={() => toggleTable(tKey)}
                                    className="flex items-center gap-1 px-2 py-0.5 cursor-grab active:cursor-grabbing hover:bg-[#2d2d30] rounded-sm group"
                                  >
                                    <span className="text-[#6a6a6a] w-3 shrink-0">
                                      {tExpanded ? (
                                        <ChevronDown size={9} />
                                      ) : (
                                        <ChevronRight size={9} />
                                      )}
                                    </span>
                                    <Table2
                                      size={11}
                                      className={clsx(
                                        'shrink-0',
                                        table.table_type === 'VIEW'
                                          ? 'text-[#dcdcaa]'
                                          : 'text-[#4ec9b0]'
                                      )}
                                    />
                                    <span className="truncate text-[#cccccc]">
                                      {table.table_name}
                                    </span>
                                    <span className="ml-auto text-[9px] text-[#4a4a4a] opacity-0 group-hover:opacity-100 shrink-0">
                                      {table.columns.length} cols
                                    </span>
                                  </div>

                                  {tExpanded && table.columns.length > 0 && (
                                    <div className="ml-6 border-l border-[#2d2d30]">
                                      {table.columns.map((col: CachedTable['columns'][number]) => (
                                        <div
                                          key={col.name}
                                          className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-[#969696]"
                                        >
                                          <ColTypeBadge type={col.type} />
                                          <span className="truncate">{col.name}</span>
                                          {col.nullable === false && (
                                            <span className="ml-auto text-[9px] text-[#4a4a4a]">
                                              NN
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {catalogSchemas.length === 0 && (
                    <div className="px-4 py-0.5 text-[10px] text-[#4a4a4a]">
                      No schemas selected
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
