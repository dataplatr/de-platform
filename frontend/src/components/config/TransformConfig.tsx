import { useCallback, useState, useRef, useEffect } from 'react'
import { Plus, Search, X, AlertTriangle } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformConfig as Cfg, TransformColumnDef, Column } from '../../types'
import clsx from 'clsx'

// ── Cast type options ─────────────────────────────────────────────────────────
const CAST_TYPES = ['', 'VARCHAR', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP']

// ── Incompatible / unusual cast warnings ──────────────────────────────────────
type WarnLevel = 'warn' | 'error'
type CastWarningMap = Partial<Record<string, { level: WarnLevel; msg: string }>>

const CAST_WARNINGS: Record<string, CastWarningMap> = {
  VARCHAR: {
    INTEGER: { level: 'error', msg: 'Will fail at runtime if any values are non-numeric.' },
    FLOAT: { level: 'error', msg: 'Will fail at runtime if any values are non-numeric.' },
    BOOLEAN: {
      level: 'error',
      msg: 'Only "true"/"false" strings are valid — all others will error.',
    },
    DATE: {
      level: 'error',
      msg: 'Will fail if the format does not match the expected date pattern.',
    },
    TIMESTAMP: { level: 'error', msg: 'Will fail if the format does not match ISO 8601.' },
  },
  INTEGER: {
    BOOLEAN: { level: 'warn', msg: '0 → false, any non-zero → true.' },
    DATE: { level: 'error', msg: 'Treating an integer as a date epoch is rarely intentional.' },
    TIMESTAMP: {
      level: 'error',
      msg: 'Treating an integer as a timestamp epoch is rarely intentional.',
    },
  },
  FLOAT: {
    INTEGER: { level: 'warn', msg: 'Decimal places will be silently truncated.' },
    BOOLEAN: { level: 'warn', msg: '0.0 → false, any non-zero → true.' },
    DATE: { level: 'error', msg: 'Float → Date is not a standard conversion.' },
    TIMESTAMP: { level: 'error', msg: 'Float → Timestamp is not a standard conversion.' },
  },
  BOOLEAN: {
    DATE: { level: 'error', msg: 'Boolean → Date has no meaningful interpretation.' },
    TIMESTAMP: { level: 'error', msg: 'Boolean → Timestamp has no meaningful interpretation.' },
  },
  DATE: {
    INTEGER: {
      level: 'warn',
      msg: 'Produces days-since-epoch (may be intentional for arithmetic).',
    },
    FLOAT: { level: 'warn', msg: 'Unusual — produces days-since-epoch as a float.' },
    BOOLEAN: { level: 'error', msg: 'Date → Boolean has no meaningful interpretation.' },
  },
  TIMESTAMP: {
    INTEGER: { level: 'warn', msg: 'Produces microseconds-since-epoch.' },
    FLOAT: { level: 'warn', msg: 'Unusual — produces fractional seconds since epoch.' },
    BOOLEAN: { level: 'error', msg: 'Timestamp → Boolean has no meaningful interpretation.' },
  },
}

function getCastWarning(fromType: string | undefined, toType: string) {
  if (!fromType || !toType) return null
  return CAST_WARNINGS[fromType.toUpperCase()]?.[toType.toUpperCase()] ?? null
}

// ── Function library ──────────────────────────────────────────────────────────
type TypeCategory = 'string' | 'number' | 'date' | 'boolean' | 'any'

const FN_GROUPS: {
  label: string
  color: string
  category: TypeCategory
  fns: { label: string; snippet: string; tip: string }[]
}[] = [
  {
    label: 'String',
    color: 'text-[var(--accent-fg)]',
    category: 'string',
    fns: [
      { label: 'UPPER', snippet: 'UPPER({col})', tip: 'Uppercase' },
      { label: 'LOWER', snippet: 'LOWER({col})', tip: 'Lowercase' },
      { label: 'TRIM', snippet: 'TRIM({col})', tip: 'Strip whitespace' },
      { label: 'LENGTH', snippet: 'LENGTH({col})', tip: 'String length' },
      { label: 'SUBSTR', snippet: 'SUBSTR({col}, 1, 10)', tip: 'Substring (pos, len)' },
      { label: 'CONCAT', snippet: "CONCAT({col}, '_suffix')", tip: 'Concatenate strings' },
      { label: 'REPLACE', snippet: "REPLACE({col}, 'old', 'new')", tip: 'Replace substring' },
      { label: 'SPLIT', snippet: "STRING_SPLIT({col}, ',')[1]", tip: 'Split on delimiter' },
    ],
  },
  {
    label: 'Date',
    color: 'text-[var(--step-filter)]',
    category: 'date',
    fns: [
      { label: 'TO_DATE', snippet: "STRPTIME({col}, '%Y-%m-%d')", tip: 'Parse date string' },
      { label: 'FORMAT', snippet: "STRFTIME({col}, '%Y-%m')", tip: 'Format as YYYY-MM' },
      { label: 'DATE_TRUNC', snippet: "DATE_TRUNC('month', {col})", tip: 'Truncate to month' },
      { label: 'YEAR', snippet: 'YEAR({col})', tip: 'Extract year (integer)' },
      { label: 'MONTH', snippet: 'MONTH({col})', tip: 'Extract month' },
      { label: 'DAY', snippet: 'DAY({col})', tip: 'Extract day' },
      {
        label: 'DATEDIFF',
        snippet: "DATEDIFF('day', {col}, CURRENT_DATE)",
        tip: 'Days from today',
      },
      { label: 'DATEADD', snippet: "({col} + INTERVAL '1 month')", tip: 'Add 1 month' },
    ],
  },
  {
    label: 'Number',
    color: 'text-[var(--step-aggregate)]',
    category: 'number',
    fns: [
      { label: 'ROUND', snippet: 'ROUND({col}, 2)', tip: 'Round to 2 decimal places' },
      { label: 'FLOOR', snippet: 'FLOOR({col})', tip: 'Round down to integer' },
      { label: 'CEIL', snippet: 'CEIL({col})', tip: 'Round up to integer' },
      { label: 'ABS', snippet: 'ABS({col})', tip: 'Absolute value' },
      { label: 'MOD', snippet: 'MOD({col}, 2)', tip: 'Modulo' },
    ],
  },
  {
    label: 'Null',
    color: 'text-[var(--success)]',
    category: 'any',
    fns: [
      {
        label: 'COALESCE',
        snippet: "COALESCE({col}, 'default')",
        tip: 'Replace NULL with default',
      },
      { label: 'NULLIF', snippet: "NULLIF({col}, '')", tip: 'NULL if empty string' },
      { label: 'IFNULL', snippet: 'IFNULL({col}, 0)', tip: 'Replace NULL with 0' },
      {
        label: 'CASE',
        snippet: "CASE WHEN {col} IS NULL THEN 'unknown' ELSE {col} END",
        tip: 'CASE expression',
      },
    ],
  },
]

function toCategory(colType: string | undefined): TypeCategory {
  if (!colType) return 'any'
  const t = colType.toUpperCase()
  if (['VARCHAR', 'TEXT', 'STRING', 'CHAR'].some((k) => t.includes(k))) return 'string'
  if (
    [
      'INTEGER',
      'INT',
      'BIGINT',
      'SMALLINT',
      'FLOAT',
      'DOUBLE',
      'REAL',
      'DECIMAL',
      'NUMERIC',
      'NUMBER',
    ].some((k) => t.includes(k))
  )
    return 'number'
  if (['DATE', 'TIMESTAMP', 'TIME'].some((k) => t.includes(k))) return 'date'
  if (['BOOLEAN', 'BOOL'].some((k) => t.includes(k))) return 'boolean'
  return 'any'
}

// Type badge colors
const TYPE_BADGE: Record<string, string> = {
  VARCHAR: 'bg-[rgba(79,193,255,0.12)] text-[var(--accent-fg)]',
  TEXT: 'bg-[rgba(79,193,255,0.12)] text-[var(--accent-fg)]',
  INTEGER: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  INT: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  FLOAT: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  DOUBLE: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  DECIMAL: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  NUMBER: 'bg-[rgba(34,197,94,0.12)] text-[var(--chip-aggregate-text)]',
  DATE: 'bg-[rgba(249,115,22,0.12)] text-[var(--chip-filter-text)]',
  TIMESTAMP: 'bg-[rgba(249,115,22,0.12)] text-[var(--chip-filter-text)]',
  BOOLEAN: 'bg-[rgba(168,85,247,0.12)] text-[var(--chip-select-text)]',
}
function typeBadgeClass(t: string | undefined) {
  if (!t) return 'bg-[rgba(106,106,106,0.2)] text-muted'
  return TYPE_BADGE[t.toUpperCase()] ?? 'bg-[rgba(106,106,106,0.2)] text-muted'
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  nodeId: string
  config: Cfg
  columns: Column[]
}

export function TransformConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const exprRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedIdx !== null) exprRef.current?.focus()
  }, [selectedIdx])

  const set = useCallback(
    (rows: TransformColumnDef[]) => {
      updateNode(nodeId, { config: { columns: rows } as Cfg })
    },
    [nodeId, updateNode]
  )

  const update = useCallback(
    (i: number, patch: Partial<TransformColumnDef>) => {
      set(config.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
    },
    [config.columns, set]
  )

  const toggleAll = useCallback(
    (enabled: boolean) => {
      set(config.columns.map((c) => ({ ...c, enabled })))
    },
    [config.columns, set]
  )

  const addDerived = useCallback(() => {
    const row: TransformColumnDef = {
      source: '',
      outputName: 'new_col',
      castType: '',
      expression: '',
      enabled: true,
    }
    set([...config.columns, row])
    setSelectedIdx(config.columns.length)
  }, [config.columns, set])

  const removeRow = useCallback(
    (i: number, e: React.MouseEvent) => {
      e.stopPropagation()
      set(config.columns.filter((_, idx) => idx !== i))
      if (selectedIdx === i) setSelectedIdx(null)
      else if (selectedIdx !== null && selectedIdx > i) setSelectedIdx(selectedIdx - 1)
    },
    [config.columns, set, selectedIdx]
  )

  const insertSnippet = useCallback(
    (snippet: string) => {
      if (selectedIdx === null) return
      const row = config.columns[selectedIdx]
      if (!row) return
      update(selectedIdx, { expression: snippet.replace(/\{col\}/g, row.source || 'col') })
      setTimeout(() => exprRef.current?.focus(), 10)
    },
    [selectedIdx, config.columns, update]
  )

  if (columns.length === 0 && config.columns.length === 0) {
    return <p className="text-[11px] text-muted italic p-2">Connect a source node first.</p>
  }

  const displayRows = searchQuery
    ? config.columns.filter(
        (r) =>
          r.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.outputName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : config.columns

  const selectedRow = selectedIdx !== null ? config.columns[selectedIdx] : null
  const enabledCount = config.columns.filter((c) => c.enabled).length

  const selectedColType = selectedRow?.source
    ? columns.find((c) => c.name === selectedRow.source)?.type
    : undefined
  const colCategory = toCategory(selectedColType)
  const visibleGroups = FN_GROUPS.filter(
    (g) => g.category === 'any' || g.category === colCategory || colCategory === 'any'
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-theme shrink-0">
        <Search size={11} className="text-muted shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter columns…"
          aria-label="Filter columns"
          className="flex-1 bg-transparent text-[11px] text-primary outline-none placeholder-[var(--text-3)]"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} title="Clear">
            <X size={10} className="text-muted" />
          </button>
        )}
        <span className="text-[10px] text-muted shrink-0">
          {enabledCount}/{config.columns.length}
        </span>
        <button
          type="button"
          onClick={() => toggleAll(true)}
          className="text-[10px] text-[var(--accent-fg)] hover:underline shrink-0"
        >
          All
        </button>
        <button
          type="button"
          onClick={() => toggleAll(false)}
          className="text-[10px] text-secondary hover:underline shrink-0"
        >
          None
        </button>
      </div>

      {/* Column table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {/* Header — checkbox | source+type | output name | cast | × */}
        <div className="tcfg-grid grid px-2 py-0.5 text-[9px] text-muted uppercase tracking-wider sticky top-0 bg-surface border-b border-theme">
          <span />
          <span>Source · Type</span>
          <span>Output name</span>
          <span>Cast to</span>
          <span />
        </div>

        {displayRows.map((row, _i) => {
          const i = searchQuery ? config.columns.indexOf(row) : _i
          const isSelected = selectedIdx === i
          const isDerived = !row.source
          const colType = row.source ? columns.find((c) => c.name === row.source)?.type : undefined
          const castWarn = getCastWarning(colType, row.castType)

          return (
            <div
              key={i}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className={clsx(
                'tcfg-grid grid items-center px-2 py-0.5 cursor-pointer transition-colors border-b border-theme tcfg-row',
                'hover:bg-elevated',
                isSelected && 'bg-[var(--selected-bg)] hover:bg-[var(--selected-bg)]',
                !row.enabled && 'opacity-40'
              )}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => {
                  e.stopPropagation()
                  update(i, { enabled: e.target.checked })
                }}
                className="accent-[var(--accent)] cursor-pointer"
                title="Include in output"
              />

              {/* Source + type badge */}
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className={clsx(
                    'text-[11px] font-mono truncate shrink-0',
                    isDerived
                      ? 'text-[var(--step-transform)] italic'
                      : isSelected
                        ? 'text-primary'
                        : 'text-[var(--step-select)]'
                  )}
                >
                  {isDerived ? 'derived' : row.source}
                </span>
                {isDerived ? (
                  <span
                    className="text-[9px] text-[var(--step-transform)]"
                    title="Derived/computed column"
                  >
                    ⚡
                  </span>
                ) : (
                  colType && (
                    <span
                      className={clsx(
                        'text-[8px] font-bold px-1 rounded shrink-0',
                        typeBadgeClass(colType)
                      )}
                    >
                      {colType}
                    </span>
                  )
                )}
              </div>

              {/* Output name */}
              <input
                type="text"
                value={row.outputName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => update(i, { outputName: e.target.value })}
                disabled={!row.enabled}
                placeholder={row.source || 'col_name'}
                className={clsx(
                  'bg-transparent text-[11px] font-mono outline-none w-full truncate',
                  'border-b border-transparent focus:border-[var(--accent-fg)] transition-colors',
                  row.outputName !== row.source ? 'text-[var(--step-filter)]' : 'text-muted',
                  !row.enabled && 'cursor-not-allowed'
                )}
              />

              {/* Cast + warning */}
              <div className="flex items-center gap-0.5 min-w-0">
                <select
                  value={row.castType}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => update(i, { castType: e.target.value })}
                  disabled={!row.enabled}
                  title={castWarn ? castWarn.msg : 'Cast to type'}
                  className={clsx(
                    'bg-transparent text-[10px] outline-none flex-1 cursor-pointer disabled:cursor-not-allowed truncate',
                    castWarn?.level === 'error'
                      ? 'text-error'
                      : castWarn?.level === 'warn'
                        ? 'text-[var(--warning)]'
                        : 'text-muted'
                  )}
                >
                  {CAST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t || 'No cast'}
                    </option>
                  ))}
                </select>
                {castWarn && (
                  <AlertTriangle
                    size={10}
                    aria-label={castWarn.msg}
                    className={
                      castWarn.level === 'error'
                        ? 'text-error shrink-0'
                        : 'text-[var(--warning)] shrink-0'
                    }
                  />
                )}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => removeRow(i, e)}
                title={isDerived ? 'Delete derived column' : 'Remove from output'}
                className="p-0.5 rounded text-muted hover:text-error hover:bg-[var(--node-filter-bg)] transition-colors opacity-50 hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={addDerived}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted hover:text-[var(--step-transform)] hover:bg-elevated transition-colors border-t border-theme"
        >
          <Plus size={11} />
          Add derived column
        </button>
      </div>

      {/* Expression panel — closeable, type-aware function groups */}
      {selectedRow && (
        <div className="shrink-0 border-t-2 border-[var(--accent-fg)] bg-app">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-theme">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-secondary shrink-0">Expression ·</span>
              <span className="text-[var(--step-filter)] font-mono text-[10px] truncate">
                {selectedRow.outputName || selectedRow.source}
              </span>
              {selectedColType && (
                <span
                  className={clsx(
                    'text-[8px] font-bold px-1 rounded shrink-0',
                    typeBadgeClass(selectedColType)
                  )}
                >
                  {selectedColType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedRow.expression && (
                <button
                  type="button"
                  onClick={() => update(selectedIdx!, { expression: '' })}
                  className="text-[10px] text-muted hover:text-error transition-colors"
                  title="Clear expression"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIdx(null)}
                title="Close panel"
                className="p-0.5 rounded text-muted hover:text-primary hover:bg-elevated transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Expression input */}
          <div className="px-3 py-2">
            <input
              ref={exprRef}
              type="text"
              value={selectedRow.expression}
              onChange={(e) => update(selectedIdx!, { expression: e.target.value })}
              placeholder={
                selectedRow.source
                  ? `${selectedRow.source} (no expression = passthrough)`
                  : 'SQL expression e.g. UPPER(name)'
              }
              className="w-full bg-elevated border border-theme focus:border-[var(--accent-fg)] text-[var(--step-transform)] text-[11px] font-mono rounded px-2 py-1.5 outline-none transition-colors placeholder-[var(--text-3)]"
            />
            {selectedRow.expression && (
              <p className="text-[9px] text-muted mt-1 font-mono truncate">
                → {selectedRow.expression} AS {selectedRow.outputName || selectedRow.source}
              </p>
            )}
          </div>

          {/* Function palette — filtered by column type */}
          <div className="px-3 pb-2.5 flex flex-col gap-1.5">
            {visibleGroups.map((group) => (
              <div key={group.label} className="flex items-start gap-1.5">
                <span
                  className={clsx(
                    'text-[9px] font-semibold uppercase w-10 shrink-0 pt-0.5',
                    group.color
                  )}
                >
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {group.fns.map((fn) => (
                    <button
                      key={fn.label}
                      type="button"
                      title={fn.tip}
                      onClick={() => insertSnippet(fn.snippet)}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-elevated text-secondary hover:bg-[var(--bg-input)] hover:text-primary border border-theme hover:border-[var(--text-3)] transition-colors font-mono"
                    >
                      {fn.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
