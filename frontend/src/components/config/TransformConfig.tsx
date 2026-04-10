/**
 * TransformConfig — redesigned for clarity and narrow-panel friendliness.
 *
 * Layout:
 *   ┌─ search bar ───────────────────────┐
 *   │  [✓] source_col  FLOAT  [renamed·] [✎] │  ← compact 3-col main list
 *   │  [✓] other_col   INT              [✎] │
 *   │  ...                                  │
 *   │  + Add derived column                  │
 *   ├─ column detail panel (when selected) ─┤
 *   │  ← source_col  FLOAT         [close]  │
 *   │  Output Name ──────────────────────── │
 *   │  Cast To ──────────────────────────── │
 *   │  SQL Expression (optional) ─────────  │
 *   │  [fn palette]                          │
 *   └───────────────────────────────────────┘
 *
 * The detail panel replaces the old always-visible expression tab, making it
 * obvious that clicking a row lets you edit its properties — not its source name.
 */
import { useCallback, useState, useRef, useEffect } from 'react'
import { Plus, Search, X, AlertTriangle, Pencil, Check, ArrowLeft } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformConfig as Cfg, TransformColumnDef, Column } from '../../types'
import clsx from 'clsx'

// ── Cast type options ─────────────────────────────────────────────────────────
const CAST_TYPES = ['', 'VARCHAR', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP']

// ── Cast warnings ─────────────────────────────────────────────────────────────
type WarnLevel = 'warn' | 'error'
type CastWarningMap = Partial<Record<string, { level: WarnLevel; msg: string }>>

const CAST_WARNINGS: Record<string, CastWarningMap> = {
  VARCHAR: {
    INTEGER: { level: 'error', msg: 'Will fail at runtime if any values are non-numeric.' },
    FLOAT: { level: 'error', msg: 'Will fail at runtime if any values are non-numeric.' },
    BOOLEAN: { level: 'error', msg: 'Only "true"/"false" strings are valid — all others will error.' },
    DATE: { level: 'error', msg: 'Will fail if the format does not match the expected date pattern.' },
    TIMESTAMP: { level: 'error', msg: 'Will fail if the format does not match ISO 8601.' },
  },
  INTEGER: {
    BOOLEAN: { level: 'warn', msg: '0 → false, any non-zero → true.' },
    DATE: { level: 'error', msg: 'Treating an integer as a date epoch is rarely intentional.' },
    TIMESTAMP: { level: 'error', msg: 'Treating an integer as a timestamp epoch is rarely intentional.' },
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
    INTEGER: { level: 'warn', msg: 'Produces days-since-epoch (may be intentional for arithmetic).' },
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
    ],
  },
  {
    label: 'Date',
    color: 'text-[var(--chip-filter-text)]',
    category: 'date',
    fns: [
      { label: 'TO_DATE', snippet: "STRPTIME({col}, '%Y-%m-%d')", tip: 'Parse date string' },
      { label: 'FORMAT', snippet: "STRFTIME({col}, '%Y-%m')", tip: 'Format as YYYY-MM' },
      { label: 'DATE_TRUNC', snippet: "DATE_TRUNC('month', {col})", tip: 'Truncate to month' },
      { label: 'YEAR', snippet: 'YEAR({col})', tip: 'Extract year' },
      { label: 'MONTH', snippet: 'MONTH({col})', tip: 'Extract month' },
      { label: 'DAY', snippet: 'DAY({col})', tip: 'Extract day' },
      { label: 'DATEDIFF', snippet: "DATEDIFF('day', {col}, CURRENT_DATE)", tip: 'Days from today' },
    ],
  },
  {
    label: 'Number',
    color: 'text-[var(--chip-aggregate-text)]',
    category: 'number',
    fns: [
      { label: 'ROUND', snippet: 'ROUND({col}, 2)', tip: 'Round to 2 dp' },
      { label: 'FLOOR', snippet: 'FLOOR({col})', tip: 'Round down' },
      { label: 'CEIL', snippet: 'CEIL({col})', tip: 'Round up' },
      { label: 'ABS', snippet: 'ABS({col})', tip: 'Absolute value' },
      { label: 'MOD', snippet: 'MOD({col}, 2)', tip: 'Modulo' },
    ],
  },
  {
    label: 'Null',
    color: 'text-[var(--success)]',
    category: 'any',
    fns: [
      { label: 'COALESCE', snippet: "COALESCE({col}, 'default')", tip: 'Replace NULL with default' },
      { label: 'NULLIF', snippet: "NULLIF({col}, '')", tip: 'NULL if empty string' },
      { label: 'IFNULL', snippet: 'IFNULL({col}, 0)', tip: 'Replace NULL with 0' },
      { label: 'CASE', snippet: "CASE WHEN {col} IS NULL THEN 'unknown' ELSE {col} END", tip: 'CASE expression' },
    ],
  },
]

function toCategory(colType: string | undefined): TypeCategory {
  if (!colType) return 'any'
  const t = colType.toUpperCase()
  if (['VARCHAR', 'TEXT', 'STRING', 'CHAR'].some((k) => t.includes(k))) return 'string'
  if (['INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'FLOAT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC', 'NUMBER'].some((k) => t.includes(k))) return 'number'
  if (['DATE', 'TIMESTAMP', 'TIME'].some((k) => t.includes(k))) return 'date'
  if (['BOOLEAN', 'BOOL'].some((k) => t.includes(k))) return 'boolean'
  return 'any'
}

// Type badge
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

// ── Column Detail Panel ───────────────────────────────────────────────────────

interface DetailPanelProps {
  row: TransformColumnDef
  rowIndex: number
  colType: string | undefined
  onUpdate: (patch: Partial<TransformColumnDef>) => void
  onClose: () => void
  columns: Column[]
}

function ColumnDetailPanel({ row, rowIndex, colType, onUpdate, onClose, columns }: DetailPanelProps) {
  const exprRef = useRef<HTMLInputElement>(null)
  const isDerived = !row.source
  const colCategory = toCategory(colType)
  const castWarn = getCastWarning(colType, row.castType)

  const visibleGroups = FN_GROUPS.filter(
    (g) => g.category === 'any' || g.category === colCategory || colCategory === 'any'
  )

  const insertSnippet = useCallback(
    (snippet: string) => {
      const expanded = snippet.replace(/\{col\}/g, row.source || 'col')
      onUpdate({ expression: expanded })
      setTimeout(() => exprRef.current?.focus(), 10)
    },
    [row.source, onUpdate]
  )

  return (
    <div className="shrink-0 border-t-2 border-[var(--accent-fg)] bg-app flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded text-muted hover:text-primary hover:bg-elevated transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft size={11} />
          </button>
          <span
            className={clsx(
              'text-[11px] font-mono font-semibold truncate',
              isDerived ? 'text-[var(--step-transform)] italic' : 'text-primary'
            )}
          >
            {isDerived ? 'derived column' : row.source}
          </span>
          {colType && (
            <span className={clsx('text-[8px] font-bold px-1 rounded shrink-0', typeBadgeClass(colType))}>
              {colType}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-muted hover:text-primary hover:bg-elevated transition-colors shrink-0"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {/* Scrollable fields */}
      <div className="overflow-y-auto scrollbar-thin flex flex-col gap-0">

        {/* Output Name */}
        <div className="px-3 pt-2.5 pb-2 border-b border-theme">
          <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-1">
            Output Column Name
          </label>
          <input
            type="text"
            value={row.outputName}
            onChange={(e) => onUpdate({ outputName: e.target.value })}
            placeholder={row.source || 'column_name'}
            className={clsx(
              'w-full bg-elevated border border-theme rounded px-2 py-1 text-[11px] font-mono outline-none',
              'focus:border-[var(--accent-fg)] transition-colors',
              row.outputName !== row.source && row.outputName
                ? 'text-[var(--chip-filter-text)]'
                : 'text-primary'
            )}
          />
          {row.outputName && row.outputName !== row.source && (
            <p className="text-[9px] text-muted mt-0.5">
              Renamed from{' '}
              <span className="font-mono text-[var(--step-select)]">{row.source || 'derived'}</span>
            </p>
          )}
        </div>

        {/* Cast Type */}
        <div className="px-3 pt-2 pb-2 border-b border-theme">
          <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-1">
            Cast To Type
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={row.castType}
              onChange={(e) => onUpdate({ castType: e.target.value })}
              aria-label="Cast to type"
              className={clsx(
                'flex-1 bg-elevated border border-theme rounded px-2 py-1 text-[11px] outline-none cursor-pointer',
                'focus:border-[var(--accent-fg)] transition-colors',
                castWarn?.level === 'error'
                  ? 'text-error border-error/40'
                  : castWarn?.level === 'warn'
                    ? 'text-[var(--warning)] border-[var(--warning)]/40'
                    : 'text-primary'
              )}
            >
              {CAST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || 'No cast (pass through)'}
                </option>
              ))}
            </select>
            {castWarn && (
              <AlertTriangle
                size={12}
                className={castWarn.level === 'error' ? 'text-error shrink-0' : 'text-[var(--warning)] shrink-0'}
                title={castWarn.msg}
              />
            )}
          </div>
          {castWarn && (
            <p className={clsx('text-[9px] mt-1', castWarn.level === 'error' ? 'text-error' : 'text-[var(--warning)]')}>
              {castWarn.msg}
            </p>
          )}
        </div>

        {/* SQL Expression */}
        <div className="px-3 pt-2 pb-2 border-b border-theme">
          <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-0.5">
            SQL Expression
          </label>
          <p className="text-[9px] text-muted mb-1.5">
            Optional. Leave blank to pass the column through unchanged.
          </p>
          <input
            ref={exprRef}
            type="text"
            value={row.expression}
            onChange={(e) => onUpdate({ expression: e.target.value })}
            placeholder={row.source ? `${row.source}  (passthrough)` : 'UPPER(col), ROUND(col, 2), …'}
            className="w-full bg-elevated border border-theme focus:border-[var(--accent-fg)] text-[var(--step-transform)] text-[11px] font-mono rounded px-2 py-1.5 outline-none transition-colors placeholder-[var(--text-3)]"
          />
          {row.expression && (
            <p className="text-[9px] text-muted mt-1 font-mono truncate">
              → {row.expression} AS {row.outputName || row.source}
            </p>
          )}
          {row.expression && (
            <button
              type="button"
              onClick={() => onUpdate({ expression: '' })}
              className="mt-1 text-[9px] text-muted hover:text-error transition-colors"
            >
              Clear expression
            </button>
          )}
        </div>

        {/* Function palette */}
        {visibleGroups.length > 0 && (
          <div className="px-3 pt-2 pb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1.5">
              Quick Functions
            </p>
            <div className="flex flex-col gap-1.5">
              {visibleGroups.map((group) => (
                <div key={group.label} className="flex items-start gap-1.5">
                  <span className={clsx('text-[9px] font-semibold uppercase w-9 shrink-0 pt-0.5', group.color)}>
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
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  nodeId: string
  config: Cfg
  columns: Column[]
}

export function TransformConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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

  if (columns.length === 0 && config.columns.length === 0) {
    return <p className="text-[11px] text-muted italic p-3">Connect a source node first.</p>
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Search / toggle bar ── */}
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
        <span className="text-[10px] text-muted shrink-0">{enabledCount}/{config.columns.length}</span>
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

      {/* ── Column list ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {/* Header */}
        <div className="tcfg-grid-v2 grid px-2 py-0.5 text-[9px] text-muted uppercase tracking-wider sticky top-0 bg-surface border-b border-theme">
          <span />
          <span>Source · Type</span>
          <span />
        </div>

        {displayRows.map((row, _i) => {
          const i = searchQuery ? config.columns.indexOf(row) : _i
          const isSelected = selectedIdx === i
          const isDerived = !row.source
          const colType = row.source ? columns.find((c) => c.name === row.source)?.type : undefined
          const castWarn = getCastWarning(colType, row.castType)
          const isRenamed = row.outputName && row.outputName !== row.source
          const hasExpression = !!row.expression

          return (
            <div
              key={i}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className={clsx(
                'tcfg-grid-v2 grid items-center px-2 py-1 cursor-pointer transition-colors border-b border-theme',
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

              {/* Source name + type badge + status indicators */}
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                <span
                  className={clsx(
                    'text-[11px] font-mono truncate',
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
                  <span className="text-[9px] text-[var(--step-transform)] shrink-0" title="Derived column">⚡</span>
                ) : (
                  colType && (
                    <span className={clsx('text-[8px] font-bold px-1 rounded shrink-0', typeBadgeClass(colType))}>
                      {colType}
                    </span>
                  )
                )}
                {/* Status dots */}
                {isRenamed && (
                  <span
                    className="text-[8px] font-mono text-[var(--chip-filter-text)] shrink-0 truncate max-w-[60px]"
                    title={`Renamed to: ${row.outputName}`}
                  >
                    →{row.outputName}
                  </span>
                )}
                {hasExpression && (
                  <span className="text-[9px] text-[var(--step-transform)] shrink-0" title="Has SQL expression">ƒ</span>
                )}
                {castWarn && (
                  <AlertTriangle
                    size={9}
                    className={clsx('shrink-0', castWarn.level === 'error' ? 'text-error' : 'text-[var(--warning)]')}
                    title={castWarn.msg}
                  />
                )}
              </div>

              {/* Edit / remove buttons */}
              <div className="flex items-center justify-end gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedIdx(isSelected ? null : i)
                  }}
                  title="Edit column"
                  className={clsx(
                    'p-1 rounded transition-colors',
                    isSelected
                      ? 'text-[var(--accent-fg)] bg-[var(--accent)]/20'
                      : 'text-muted hover:text-[var(--accent-fg)] hover:bg-elevated opacity-60 hover:opacity-100'
                  )}
                >
                  <Pencil size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => removeRow(i, e)}
                  title={isDerived ? 'Delete derived column' : 'Remove from output'}
                  className="p-1 rounded text-muted hover:text-error hover:bg-[var(--node-filter-bg)] transition-colors opacity-40 hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
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

      {/* ── Column detail panel (replaces old expression tab) ── */}
      {selectedRow !== null && selectedIdx !== null && (
        <ColumnDetailPanel
          row={selectedRow}
          rowIndex={selectedIdx}
          colType={selectedColType}
          onUpdate={(patch) => update(selectedIdx, patch)}
          onClose={() => setSelectedIdx(null)}
          columns={columns}
        />
      )}
    </div>
  )
}
