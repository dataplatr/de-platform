/**
 * UnityTreeBrowser — lazy Unity Catalog tree for a single Databricks connection.
 *
 * Levels:
 *   1. Catalogs (loaded at mount)
 *   2. Schemas per catalog (loaded on expand)
 *   3. Tables per schema (loaded on expand, NO columns)
 *   4. Columns — fetched lazily only when a table is expanded or on drag start
 *
 * Drag payload (application/lakeflow-node):
 *   { connectionAlias, tableRef, label, sourceType, columns }
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Loader2, Table2 } from 'lucide-react'
import { api } from '../../services/api'
import type { DatabricksConnection, ColumnType } from '../../types'
import clsx from 'clsx'

// ── Type aliases ──────────────────────────────────────────────────────────────

interface CatalogNode {
  name: string
  schemas?: SchemaNode[]
  loading?: boolean
  expanded?: boolean
}

interface SchemaNode {
  name: string
  tables?: TableNode[]
  loading?: boolean
  expanded?: boolean
}

interface TableNode {
  name: string
  table_type: string
  columns?: ColNode[]
  loading?: boolean
  expanded?: boolean
}

interface ColNode {
  name: string
  type: string
  nullable: boolean
}

// ── Column type tag ───────────────────────────────────────────────────────────

function ColTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    VARCHAR: 'text-[#9cdcfe]',
    TEXT: 'text-[#9cdcfe]',
    INTEGER: 'text-[#b5cea8]',
    FLOAT: 'text-[#b5cea8]',
    DATE: 'text-[#ce9178]',
    TIMESTAMP: 'text-[#ce9178]',
    BOOLEAN: 'text-[#569cd6]',
  }
  const abbr: Record<string, string> = {
    VARCHAR: 'str',
    TEXT: 'str',
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

// ── TableRow ──────────────────────────────────────────────────────────────────

function TableRow({
  connection,
  catalog,
  schema,
  table,
  onUpdate,
}: {
  connection: DatabricksConnection
  catalog: string
  schema: string
  table: TableNode
  onUpdate: (t: Partial<TableNode>) => void
}) {
  const loadColumns = useCallback(async () => {
    if (table.columns) return table.columns
    onUpdate({ loading: true })
    try {
      const { data } = await api.listColumns(connection.id, catalog, schema, table.name)
      onUpdate({ columns: data, loading: false })
      return data
    } catch {
      onUpdate({ loading: false })
      return []
    }
  }, [connection.id, catalog, schema, table, onUpdate])

  const toggle = useCallback(async () => {
    if (!table.expanded) {
      await loadColumns()
    }
    onUpdate({ expanded: !table.expanded })
  }, [table.expanded, loadColumns, onUpdate])

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy'
      // setData MUST be called synchronously — async calls after await are ignored by browsers.
      // Use already-loaded columns; if not yet loaded, kick off fetch for next drag.
      const cols = table.columns ?? []
      e.dataTransfer.setData(
        'application/lakeflow-node',
        JSON.stringify({
          connectionAlias: connection.alias,
          tableRef: `${catalog}.${schema}.${table.name}`,
          label: table.name,
          sourceType: table.table_type === 'VIEW' ? 'view' : 'table',
          columns: cols.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
        })
      )
      // Pre-fetch columns in background so next drag or expand has them ready
      if (!table.columns) loadColumns()
    },
    [connection.alias, catalog, schema, table, loadColumns]
  )

  return (
    <div>
      <div
        draggable
        onDragStart={onDragStart}
        onClick={toggle}
        className="flex items-center gap-1 px-2 py-0.5 cursor-grab active:cursor-grabbing hover:bg-[#2d2d30] rounded-sm text-xs group"
      >
        <span className="text-[#6a6a6a] w-3 shrink-0">
          {table.loading ? (
            <Loader2 size={9} className="animate-spin" />
          ) : table.expanded ? (
            <ChevronDown size={9} />
          ) : (
            <ChevronRight size={9} />
          )}
        </span>
        <Table2
          size={11}
          className={clsx(
            'shrink-0',
            table.table_type === 'VIEW' ? 'text-[#dcdcaa]' : 'text-[#4ec9b0]'
          )}
        />
        <span className="truncate text-[#cccccc]">{table.name}</span>
        {table.table_type === 'VIEW' && (
          <span className="ml-auto text-[9px] text-[#6a6a6a] opacity-0 group-hover:opacity-100">
            view
          </span>
        )}
      </div>

      {table.expanded && table.columns && (
        <div className="ml-6 border-l border-[#2d2d30]">
          {table.columns.map((col) => (
            <div
              key={col.name}
              className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-[#969696]"
            >
              <ColTag type={col.type} />
              <span className="truncate">{col.name}</span>
              {col.nullable === false && (
                <span className="ml-auto text-[9px] text-[#4a4a4a]">NN</span>
              )}
            </div>
          ))}
          {table.columns.length === 0 && (
            <div className="px-2 py-0.5 text-[10px] text-[#4a4a4a]">No columns</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SchemaRow ─────────────────────────────────────────────────────────────────

function SchemaRow({
  connection,
  catalog,
  schema,
  onUpdate,
}: {
  connection: DatabricksConnection
  catalog: string
  schema: SchemaNode
  onUpdate: (s: Partial<SchemaNode>) => void
}) {
  const toggle = useCallback(async () => {
    if (!schema.tables && !schema.expanded) {
      onUpdate({ loading: true })
      try {
        const { data } = await api.listTables(connection.id, catalog, schema.name)
        onUpdate({ tables: data, loading: false, expanded: true })
      } catch {
        onUpdate({ loading: false })
      }
    } else {
      onUpdate({ expanded: !schema.expanded })
    }
  }, [connection.id, catalog, schema, onUpdate])

  const updateTable = useCallback(
    (idx: number, patch: Partial<TableNode>) => {
      const tables = [...(schema.tables ?? [])]
      tables[idx] = { ...tables[idx], ...patch }
      onUpdate({ tables })
    },
    [schema.tables, onUpdate]
  )

  return (
    <div>
      <div
        onClick={toggle}
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#2d2d30] rounded-sm text-xs text-[#969696]"
      >
        <span className="w-3 shrink-0">
          {schema.loading ? (
            <Loader2 size={9} className="animate-spin" />
          ) : schema.expanded ? (
            <ChevronDown size={9} />
          ) : (
            <ChevronRight size={9} />
          )}
        </span>
        <span className="truncate">{schema.name}</span>
        {schema.tables && (
          <span className="ml-auto text-[10px] text-[#4a4a4a]">{schema.tables.length}</span>
        )}
      </div>

      {schema.expanded && schema.tables && (
        <div className="ml-3">
          {schema.tables.map((t, i) => (
            <TableRow
              key={t.name}
              connection={connection}
              catalog={catalog}
              schema={schema.name}
              table={t}
              onUpdate={(patch) => updateTable(i, patch)}
            />
          ))}
          {schema.tables.length === 0 && (
            <div className="px-4 py-0.5 text-[10px] text-[#4a4a4a]">No tables</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── CatalogRow ────────────────────────────────────────────────────────────────

function CatalogRow({
  connection,
  catalog,
  onUpdate,
}: {
  connection: DatabricksConnection
  catalog: CatalogNode
  onUpdate: (c: Partial<CatalogNode>) => void
}) {
  const toggle = useCallback(async () => {
    if (!catalog.schemas && !catalog.expanded) {
      onUpdate({ loading: true })
      try {
        const { data } = await api.listSchemas(connection.id, catalog.name)
        onUpdate({ schemas: data, loading: false, expanded: true })
      } catch {
        onUpdate({ loading: false })
      }
    } else {
      onUpdate({ expanded: !catalog.expanded })
    }
  }, [connection.id, catalog, onUpdate])

  const updateSchema = useCallback(
    (idx: number, patch: Partial<SchemaNode>) => {
      const schemas = [...(catalog.schemas ?? [])]
      schemas[idx] = { ...schemas[idx], ...patch }
      onUpdate({ schemas })
    },
    [catalog.schemas, onUpdate]
  )

  return (
    <div>
      <div
        onClick={toggle}
        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded-sm text-xs font-medium text-[#cccccc]"
      >
        <span className="w-3 shrink-0">
          {catalog.loading ? (
            <Loader2 size={9} className="animate-spin" />
          ) : catalog.expanded ? (
            <ChevronDown size={9} />
          ) : (
            <ChevronRight size={9} />
          )}
        </span>
        <Database size={11} className="text-[#4ec9b0] shrink-0" />
        <span className="truncate uppercase">{catalog.name}</span>
      </div>

      {catalog.expanded && catalog.schemas && (
        <div className="ml-3">
          {catalog.schemas.map((s, i) => (
            <SchemaRow
              key={s.name}
              connection={connection}
              catalog={catalog.name}
              schema={s}
              onUpdate={(patch) => updateSchema(i, patch)}
            />
          ))}
          {catalog.schemas.length === 0 && (
            <div className="px-4 py-0.5 text-[10px] text-[#4a4a4a]">No schemas</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── UnityTreeBrowser ──────────────────────────────────────────────────────────

export function UnityTreeBrowser({ connection }: { connection: DatabricksConnection }) {
  const [catalogs, setCatalogs] = useState<CatalogNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .listCatalogs(connection.id)
      .then(({ data }) => setCatalogs(data.map((c) => ({ name: c.name }))))
      .catch(() => setError('Could not load catalogs'))
      .finally(() => setLoading(false))
  }, [connection.id])

  const updateCatalog = useCallback((idx: number, patch: Partial<CatalogNode>) => {
    setCatalogs((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-[#6a6a6a] text-xs">
        <Loader2 size={12} className="animate-spin" />
        Loading catalog…
      </div>
    )
  }

  if (error) {
    return <div className="px-3 py-4 text-xs text-[#f44747]">{error}</div>
  }

  return (
    <div>
      {catalogs.map((c, i) => (
        <CatalogRow
          key={c.name}
          connection={connection}
          catalog={c}
          onUpdate={(patch) => updateCatalog(i, patch)}
        />
      ))}
      {catalogs.length === 0 && (
        <div className="px-3 py-4 text-xs text-[#4a4a4a]">No catalogs found</div>
      )}
    </div>
  )
}
