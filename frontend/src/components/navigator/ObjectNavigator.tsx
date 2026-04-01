import { useState } from 'react'
import {
  Database, Table2, FileSpreadsheet, ChevronRight, ChevronDown,
  Plus, RefreshCw, Search, Loader2
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { Column } from '../../types'
import clsx from 'clsx'

function ColumnTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TEXT: 'text-[#9cdcfe]',
    VARCHAR: 'text-[#9cdcfe]',
    NUMBER: 'text-[#b5cea8]',
    INTEGER: 'text-[#b5cea8]',
    FLOAT: 'text-[#b5cea8]',
    DATE: 'text-[#ce9178]',
    TIMESTAMP: 'text-[#ce9178]',
    BOOLEAN: 'text-[#569cd6]',
    UNKNOWN: 'text-muted',
  }
  const abbr: Record<string, string> = {
    TEXT: 'str', VARCHAR: 'str', NUMBER: 'num', INTEGER: 'int',
    FLOAT: 'flt', DATE: 'date', TIMESTAMP: 'ts', BOOLEAN: 'bool',
  }
  return (
    <span className={clsx('text-[10px] font-mono shrink-0', colors[type] ?? 'text-muted')}>
      {abbr[type] ?? type.toLowerCase().slice(0, 4)}
    </span>
  )
}

function TableNode({
  dbName, schemaName, tableName, columns,
}: {
  dbName: string; schemaName: string; tableName: string; columns: Column[]
}) {
  const [expanded, setExpanded] = useState(false)
  const { selectedTableSchema, setSelectedTableSchema } = useTransformationStore()
  const isSelected = selectedTableSchema?.table === tableName

  const tableRef = `${schemaName}.${tableName}`

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/lakeflow-node', JSON.stringify({
      tableRef,
      label: tableName,
      columns,
    }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div>
      <div
        draggable
        onDragStart={onDragStart}
        className={clsx(
          'flex items-center gap-1 px-2 py-0.5 cursor-grab active:cursor-grabbing hover:bg-elevated rounded-sm group text-xs',
          isSelected && 'bg-[#1e3a5f]'
        )}
        onClick={() => {
          setExpanded(!expanded)
          setSelectedTableSchema({ database: dbName, schema: schemaName, table: tableName, columns })
        }}
      >
        <span className="text-muted w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <Table2 size={12} className="text-[#4ec9b0] shrink-0" />
        <span className="truncate text-primary">{tableName}</span>
        <button
          type="button"
          className="ml-auto opacity-0 group-hover:opacity-100 text-muted hover:text-primary px-1"
          onClick={(e) => { e.stopPropagation() }}
          title="Add to canvas"
        >
          <Plus size={10} />
        </button>
      </div>

      {expanded && (
        <div className="ml-6 border-l border-theme">
          {columns.map((col) => (
            <div key={col.name} className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-secondary">
              <ColumnTypeTag type={col.type} />
              <span className="truncate">{col.name}</span>
              {col.nullable === false && (
                <span className="ml-auto text-[9px] text-muted">NN</span>
              )}
            </div>
          ))}
          {columns.length === 0 && (
            <div className="px-2 py-0.5 text-[10px] text-muted">No columns</div>
          )}
        </div>
      )}
    </div>
  )
}

function SchemaNode({ dbName, schema }: {
  dbName: string
  schema: { name: string; tables: { name: string; columns: Column[] }[] }
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-elevated rounded-sm text-xs text-secondary"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <span className="truncate">{schema.name}</span>
        <span className="ml-auto text-[10px] text-muted">{schema.tables.length}</span>
      </div>
      {expanded && schema.tables.map((t) => (
        <div key={t.name} className="ml-3">
          <TableNode
            dbName={dbName}
            schemaName={schema.name}
            tableName={t.name}
            columns={t.columns ?? []}
          />
        </div>
      ))}
    </div>
  )
}

function DatabaseNode({ db }: {
  db: { name: string; schemas: { name: string; tables: { name: string; columns: Column[] }[] }[] }
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-elevated rounded-sm text-xs font-medium text-primary"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <Database size={12} className="text-[var(--accent-fg)] shrink-0" />
        <span className="truncate">{db.name.toUpperCase()}</span>
      </div>
      {expanded && db.schemas.map((s) => (
        <div key={s.name} className="ml-3">
          <SchemaNode dbName={db.name} schema={s} />
        </div>
      ))}
    </div>
  )
}

export function ObjectNavigator() {
  const { databaseTree, csvSources, isConnected } = useTransformationStore()
  const [search, setSearch] = useState('')

  const filtered = databaseTree.map((db) => ({
    ...db,
    schemas: db.schemas.map((s) => ({
      ...s,
      tables: s.tables.filter((t) =>
        !search || t.name.toLowerCase().includes(search.toLowerCase())
      ),
    })).filter((s) => s.tables.length > 0),
  })).filter((db) => db.schemas.length > 0)

  const treeToShow = search ? filtered : databaseTree

  return (
    <div className="themed-panel flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme bg-surface shrink-0">
        <span className="text-xs font-medium text-primary uppercase tracking-wider">Sources</span>
        <div className="flex items-center gap-1">
          {!isConnected && (
            <Loader2 size={11} className="text-[#dcdcaa] animate-spin" />
          )}
          <button type="button" className="icon-button" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button type="button" className="icon-button" title="Add CSV">
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-theme shrink-0">
        <div className="flex items-center gap-1.5 bg-elevated rounded px-2 py-1">
          <Search size={11} className="text-muted shrink-0" />
          <input
            type="text"
            placeholder="Filter tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-primary placeholder-[#6a6a6a] outline-none w-full"
          />
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {/* CSV Files section */}
        {csvSources.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-1 px-2 py-0.5 text-xs text-secondary">
              <FileSpreadsheet size={11} className="text-[#dcdcaa]" />
              <span className="uppercase tracking-wider text-[10px]">Local Files</span>
            </div>
            {csvSources.map((csv) => (
              <div key={csv.id} className="flex items-center gap-1.5 px-4 py-0.5 text-xs text-primary hover:bg-elevated cursor-pointer">
                <FileSpreadsheet size={11} className="text-[#dcdcaa]" />
                <span className="truncate">{csv.filename}</span>
              </div>
            ))}
            <div className="mx-2 my-1 h-px border-theme" />
          </div>
        )}

        {/* Not connected yet */}
        {!isConnected && databaseTree.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted">
            <Loader2 size={16} className="animate-spin text-[#dcdcaa]" />
            <span className="text-xs">Connecting to DuckDB…</span>
          </div>
        )}

        {/* Database tree */}
        {treeToShow.map((db) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <DatabaseNode key={db.name} db={db as any} />
        ))}
      </div>
    </div>
  )
}
