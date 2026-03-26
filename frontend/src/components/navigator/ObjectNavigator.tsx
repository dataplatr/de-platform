import { useState } from 'react'
import {
  Database, Table2, FileSpreadsheet, ChevronRight, ChevronDown,
  Plus, RefreshCw, Search
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
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
    UNKNOWN: 'text-[#6a6a6a]',
  }
  const abbr: Record<string, string> = {
    TEXT: 'str', VARCHAR: 'str', NUMBER: 'num', INTEGER: 'int',
    FLOAT: 'flt', DATE: 'date', TIMESTAMP: 'ts', BOOLEAN: 'bool',
  }
  return (
    <span className={clsx('text-[10px] font-mono', colors[type] ?? 'text-[#6a6a6a]')}>
      {abbr[type] ?? type.toLowerCase().slice(0, 4)}
    </span>
  )
}

function TableNode({ dbName, schemaName, tableName }: {
  dbName: string; schemaName: string; tableName: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { selectedTableSchema, setSelectedTableSchema } = useTransformationStore()
  const isSelected = selectedTableSchema?.table === tableName

  // Placeholder columns (real data comes from API in later iterations)
  const mockColumns = [
    { name: 'id', type: 'INTEGER' as const },
    { name: 'name', type: 'VARCHAR' as const },
    { name: 'created_at', type: 'TIMESTAMP' as const },
  ]

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#2d2d30] rounded-sm group text-xs',
          isSelected && 'bg-[#1e3a5f]'
        )}
        onClick={() => {
          setExpanded(!expanded)
          setSelectedTableSchema({
            database: dbName,
            schema: schemaName,
            table: tableName,
            columns: mockColumns,
          })
        }}
      >
        <span className="text-[#6a6a6a] w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <Table2 size={12} className="text-[#4ec9b0] shrink-0" />
        <span className="truncate text-[#cccccc]">{tableName}</span>
        <button
          className="ml-auto opacity-0 group-hover:opacity-100 text-[#6a6a6a] hover:text-[#cccccc] px-1"
          onClick={(e) => {
            e.stopPropagation()
            // TODO: drag to canvas — for now just select
          }}
          title="Add to canvas"
        >
          <Plus size={10} />
        </button>
      </div>

      {expanded && (
        <div className="ml-6 border-l border-[#3c3c3c]">
          {mockColumns.map((col) => (
            <div key={col.name} className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-[#969696]">
              <ColumnTypeTag type={col.type} />
              <span className="truncate">{col.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchemaNode({ dbName, schema }: {
  dbName: string
  schema: { name: string; tables: { name: string }[] }
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#2d2d30] rounded-sm text-xs text-[#969696]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <span className="truncate">{schema.name}</span>
        <span className="ml-auto text-[10px] text-[#6a6a6a]">{schema.tables.length}</span>
      </div>
      {expanded && schema.tables.map((t) => (
        <div key={t.name} className="ml-3">
          <TableNode dbName={dbName} schemaName={schema.name} tableName={t.name} />
        </div>
      ))}
    </div>
  )
}

function DatabaseNode({ db }: { db: { name: string; schemas: { name: string; tables: { name: string }[] }[] } }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[#2d2d30] rounded-sm text-xs font-medium text-[#cccccc]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3 shrink-0">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <Database size={12} className="text-[#4fc1ff] shrink-0" />
        <span className="truncate">{db.name}</span>
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

  // Placeholder tree until connected
  const mockTree = isConnected ? databaseTree : [
    {
      name: 'DEMO_DB',
      schemas: [
        {
          name: 'PUBLIC',
          tables: [
            { name: 'GL_TRANSACTIONS' },
            { name: 'CHART_OF_ACCOUNTS' },
            { name: 'COST_CENTERS' },
          ],
        },
        {
          name: 'RAW',
          tables: [
            { name: 'SALES_ORDERS' },
            { name: 'CUSTOMERS' },
          ],
        },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
        <span className="text-xs font-medium text-[#cccccc] uppercase tracking-wider">Sources</span>
        <div className="flex items-center gap-1">
          <button className="icon-button" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button className="icon-button" title="Add CSV">
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-1.5 bg-[#3c3c3c] rounded px-2 py-1">
          <Search size={11} className="text-[#6a6a6a] shrink-0" />
          <input
            type="text"
            placeholder="Filter tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-[#cccccc] placeholder-[#6a6a6a] outline-none w-full"
          />
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {/* CSV Files section */}
        {csvSources.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-1 px-2 py-0.5 text-xs text-[#969696]">
              <FileSpreadsheet size={11} className="text-[#dcdcaa]" />
              <span className="uppercase tracking-wider text-[10px]">Local Files</span>
            </div>
            {csvSources.map((csv) => (
              <div key={csv.id} className="flex items-center gap-1.5 px-4 py-0.5 text-xs text-[#cccccc] hover:bg-[#2d2d30] cursor-pointer">
                <FileSpreadsheet size={11} className="text-[#dcdcaa]" />
                <span className="truncate">{csv.filename}</span>
              </div>
            ))}
            <div className="mx-2 my-1 h-px bg-[#3c3c3c]" />
          </div>
        )}

        {/* Database tree */}
        {mockTree.map((db) => (
          <DatabaseNode key={db.name} db={db} />
        ))}
      </div>

      {/* Bottom: Connect button */}
      {!isConnected && (
        <div className="p-2 border-t border-[#3c3c3c] shrink-0">
          <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-[#0e639c] hover:bg-[#1177bb] text-white rounded transition-colors">
            <Database size={12} />
            Connect Snowflake
          </button>
        </div>
      )}
    </div>
  )
}
