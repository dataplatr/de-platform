/**
 * TransformConfig — Coalesce-inspired column transformation editor.
 *
 * UX model:
 *  ┌──────────────────────────────────────────┐
 *  │ 🔍 Search columns      [☑ All] [None]    │  ← compact header
 *  │──────────────────────────────────────────│
 *  │ ☑ customer_id   → customer_id  [No cast] │  ← compact row (28px)
 *  │ ☑ name          → full_name    [VARCHAR] │    click row to select
 *  │ ☑ order_date    → order_date   [DATE] ⚡ │    ⚡ = has expression
 *  │ ☐ segment       (disabled)               │
 *  │──────────────────────────────────────────│
 *  │ ▼ Expression for: name                   │  ← detail panel (only when selected)
 *  │   [UPPER({col})_________________________]│
 *  │   String: [UPPER][LOWER][TRIM][LENGTH]…  │
 *  │   Date:   [TO_DATE][FORMAT][YEAR][MONTH] │
 *  │   Number: [ROUND][FLOOR][ABS]            │
 *  │   Null:   [COALESCE][NULLIF][IFNULL]     │
 *  └──────────────────────────────────────────┘
 */
import { useCallback, useState, useRef, useEffect } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformConfig as Cfg, TransformColumnDef, Column } from '../../types'
import clsx from 'clsx'

const CAST_TYPES = ['', 'VARCHAR', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP']

const FN_GROUPS = [
  {
    label: 'String',
    color: 'text-[#4fc1ff]',
    fns: [
      { label: 'UPPER',   snippet: 'UPPER({col})',                 tip: 'Uppercase'           },
      { label: 'LOWER',   snippet: 'LOWER({col})',                 tip: 'Lowercase'           },
      { label: 'TRIM',    snippet: 'TRIM({col})',                  tip: 'Strip whitespace'    },
      { label: 'LENGTH',  snippet: 'LENGTH({col})',                tip: 'String length'       },
      { label: 'SUBSTR',  snippet: "SUBSTR({col}, 1, 10)",         tip: 'Substring (pos, len)'},
      { label: 'CONCAT',  snippet: "CONCAT({col}, '_suffix')",     tip: 'Concat strings'      },
      { label: 'REPLACE', snippet: "REPLACE({col}, 'old', 'new')", tip: 'Replace substring'   },
      { label: 'SPLIT',   snippet: "STRING_SPLIT({col}, ',')[1]",  tip: 'Split on delimiter'  },
    ],
  },
  {
    label: 'Date',
    color: 'text-[#dcdcaa]',
    fns: [
      { label: 'TO_DATE',     snippet: "STRPTIME({col}, '%Y-%m-%d')",    tip: 'Parse date string'        },
      { label: 'FORMAT',      snippet: "STRFTIME({col}, '%Y-%m')",        tip: 'Format as YYYY-MM'        },
      { label: 'DATE_TRUNC',  snippet: "DATE_TRUNC('month', {col})",      tip: 'Truncate to month'        },
      { label: 'YEAR',        snippet: 'YEAR({col})',                     tip: 'Extract year'             },
      { label: 'MONTH',       snippet: 'MONTH({col})',                    tip: 'Extract month'            },
      { label: 'DAY',         snippet: 'DAY({col})',                      tip: 'Extract day'              },
      { label: 'DATEDIFF',    snippet: "DATEDIFF('day', {col}, CURRENT_DATE)", tip: 'Days from today'    },
      { label: 'DATEADD',     snippet: "({col} + INTERVAL '1 month')",    tip: 'Add 1 month'              },
    ],
  },
  {
    label: 'Number',
    color: 'text-[#c586c0]',
    fns: [
      { label: 'ROUND', snippet: 'ROUND({col}, 2)', tip: 'Round to 2 decimal places' },
      { label: 'FLOOR', snippet: 'FLOOR({col})',    tip: 'Round down'                },
      { label: 'CEIL',  snippet: 'CEIL({col})',     tip: 'Round up'                  },
      { label: 'ABS',   snippet: 'ABS({col})',      tip: 'Absolute value'            },
      { label: 'MOD',   snippet: 'MOD({col}, 2)',   tip: 'Modulo'                    },
    ],
  },
  {
    label: 'Null',
    color: 'text-[#4ec9b0]',
    fns: [
      { label: 'COALESCE', snippet: "COALESCE({col}, 'default')", tip: 'Replace NULL with default' },
      { label: 'NULLIF',   snippet: "NULLIF({col}, '')",           tip: 'NULL if empty string'      },
      { label: 'IFNULL',   snippet: 'IFNULL({col}, 0)',            tip: 'Replace NULL with 0'       },
      { label: 'CASE',     snippet: "CASE WHEN {col} IS NULL THEN 'unknown' ELSE {col} END", tip: 'CASE expression' },
    ],
  },
] as const

interface Props {
  nodeId: string
  config: Cfg
  columns: Column[]  // upstream input columns
}

export function TransformConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()
  const [selectedIdx, setSelectedIdx]   = useState<number | null>(null)
  const [searchQuery, setSearchQuery]   = useState('')
  const exprRef = useRef<HTMLInputElement>(null)

  // Focus expression input when a row is selected
  useEffect(() => {
    if (selectedIdx !== null) exprRef.current?.focus()
  }, [selectedIdx])

  const set = useCallback((rows: TransformColumnDef[]) => {
    updateNode(nodeId, { config: { columns: rows } as Cfg })
  }, [nodeId, updateNode])

  const update = useCallback((i: number, patch: Partial<TransformColumnDef>) => {
    set(config.columns.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }, [config.columns, set])

  const toggleAll = useCallback((enabled: boolean) => {
    set(config.columns.map(c => ({ ...c, enabled })))
  }, [config.columns, set])

  const addDerived = useCallback(() => {
    const newRow: TransformColumnDef = {
      source: '', outputName: 'new_col', castType: '', expression: '', enabled: true,
    }
    set([...config.columns, newRow])
    setSelectedIdx(config.columns.length) // select the new row
  }, [config.columns, set])

  const removeRow = useCallback((i: number, e: React.MouseEvent) => {
    e.stopPropagation()
    set(config.columns.filter((_, idx) => idx !== i))
    if (selectedIdx === i) setSelectedIdx(null)
    else if (selectedIdx !== null && selectedIdx > i) setSelectedIdx(selectedIdx - 1)
  }, [config.columns, set, selectedIdx])

  const insertSnippet = useCallback((snippet: string) => {
    if (selectedIdx === null) return
    const row = config.columns[selectedIdx]
    if (!row) return
    const colName = row.source || 'col'
    update(selectedIdx, { expression: snippet.replace(/\{col\}/g, colName) })
    setTimeout(() => exprRef.current?.focus(), 10)
  }, [selectedIdx, config.columns, update])

  if (columns.length === 0 && config.columns.length === 0) {
    return <p className="text-[11px] text-[#6a6a6a] italic p-2">Connect a source node first.</p>
  }

  const filtered = config.columns.filter(row =>
    !searchQuery || row.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.outputName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedRow = selectedIdx !== null ? config.columns[selectedIdx] : null
  const enabledCount = config.columns.filter(c => c.enabled).length

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top bar: search + enable toggles ─────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#2d2d30] shrink-0">
        <Search size={11} className="text-[#6a6a6a] shrink-0" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter columns…"
          aria-label="Filter columns"
          className="flex-1 bg-transparent text-[11px] text-[#cccccc] outline-none placeholder-[#4a4a4a]"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} title="Clear filter">
            <X size={10} className="text-[#6a6a6a]" />
          </button>
        )}
        <span className="text-[10px] text-[#6a6a6a] shrink-0">{enabledCount}/{config.columns.length}</span>
        <button type="button" onClick={() => toggleAll(true)}
          className="text-[10px] text-[#4fc1ff] hover:underline shrink-0">All</button>
        <button type="button" onClick={() => toggleAll(false)}
          className="text-[10px] text-[#969696] hover:underline shrink-0">None</button>
      </div>

      {/* ── Column table ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {/* Table header */}
        <div className="transform-col-grid grid px-2 py-0.5 text-[9px] text-[#4a4a4a] uppercase tracking-wider sticky top-0 bg-[#1e1e1e] border-b border-[#2d2d30]">
          <span />
          <span>Source</span>
          <span>Output name</span>
          <span>Cast</span>
          <span />
        </div>

        {(searchQuery ? filtered : config.columns).map((row, _i) => {
          // When searching, we need the real index for updates
          const i = searchQuery ? config.columns.indexOf(row) : _i
          const isSelected = selectedIdx === i
          const hasExpr = !!row.expression

          return (
            <div
              key={i}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className={clsx(
                'transform-col-grid grid items-center px-2 py-0.5 cursor-pointer transition-colors border-b border-[#1e1e1e]',
                'hover:bg-[#2d2d30]',
                isSelected && 'bg-[#1e3a5f]/40 hover:bg-[#1e3a5f]/50',
                !row.enabled && 'opacity-40'
              )}
              style={{ minHeight: 30 }}
            >
              {/* Enable */}
              <input type="checkbox" checked={row.enabled}
                onChange={e => { e.stopPropagation(); update(i, { enabled: e.target.checked }) }}
                className="accent-[#0e639c] cursor-pointer"
                title="Include in output"
              />

              {/* Source */}
              <div className="flex items-center gap-1 min-w-0">
                <span className={clsx(
                  'text-[11px] font-mono truncate',
                  row.source ? (isSelected ? 'text-[#cccccc]' : 'text-[#9cdcfe]') : 'text-[#c586c0] italic'
                )}>
                  {row.source || 'derived'}
                </span>
                {hasExpr && (
                  <span className="text-[9px] text-[#c586c0] shrink-0" title="Has expression">⚡</span>
                )}
              </div>

              {/* Output name — inline editable */}
              <input
                type="text"
                value={row.outputName}
                onClick={e => e.stopPropagation()}
                onChange={e => update(i, { outputName: e.target.value })}
                disabled={!row.enabled}
                placeholder={row.source || 'col_name'}
                className={clsx(
                  'bg-transparent text-[11px] font-mono outline-none w-full truncate',
                  'border-b border-transparent focus:border-[#4fc1ff] transition-colors',
                  row.outputName !== row.source ? 'text-[#dcdcaa]' : 'text-[#6a6a6a]',
                  !row.enabled && 'cursor-not-allowed'
                )}
              />

              {/* Cast type */}
              <select
                value={row.castType}
                onClick={e => e.stopPropagation()}
                onChange={e => update(i, { castType: e.target.value })}
                disabled={!row.enabled}
                title="Cast type"
                className="bg-transparent text-[10px] text-[#6a6a6a] outline-none w-full cursor-pointer disabled:cursor-not-allowed"
              >
                {CAST_TYPES.map(t => <option key={t} value={t}>{t || 'No cast'}</option>)}
              </select>

              {/* Remove */}
              <button type="button" onClick={e => removeRow(i, e)}
                title="Remove column"
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-[#f44747] hover:bg-[#3a1e1e] transition-colors text-[#3c3c3c]">
                <X size={10} />
              </button>
            </div>
          )
        })}

        {/* Add derived column */}
        <button type="button" onClick={addDerived}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-[#6a6a6a] hover:text-[#c586c0] hover:bg-[#2d2d30] transition-colors border-t border-[#2d2d30]">
          <Plus size={11} />
          Add derived column
        </button>
      </div>

      {/* ── Detail panel: shown when a row is selected ───────────── */}
      {selectedRow && (
        <div className="shrink-0 border-t border-[#3c3c3c] bg-[#1a1a1a]">
          {/* Detail header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2d2d30]">
            <span className="text-[10px] text-[#969696]">
              Expression for{' '}
              <span className="text-[#dcdcaa] font-mono">{selectedRow.outputName || selectedRow.source}</span>
            </span>
            {selectedRow.expression && (
              <button type="button" onClick={() => update(selectedIdx!, { expression: '' })}
                className="text-[10px] text-[#6a6a6a] hover:text-[#f44747]" title="Clear expression">
                Clear
              </button>
            )}
          </div>

          {/* Expression input */}
          <div className="px-3 py-2">
            <input
              ref={exprRef}
              type="text"
              value={selectedRow.expression}
              onChange={e => update(selectedIdx!, { expression: e.target.value })}
              placeholder={selectedRow.source ? `${selectedRow.source} (passthrough — no expression)` : 'SQL expression…'}
              className="w-full bg-[#2d2d30] border border-[#3c3c3c] focus:border-[#4fc1ff] text-[#c586c0] text-[11px] font-mono rounded px-2 py-1.5 outline-none transition-colors placeholder-[#3c3c3c]"
            />
            {selectedRow.expression && (
              <p className="text-[9px] text-[#6a6a6a] mt-1 font-mono truncate">
                → {selectedRow.expression} AS {selectedRow.outputName || selectedRow.source}
              </p>
            )}
          </div>

          {/* Function palette */}
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            {FN_GROUPS.map(group => (
              <div key={group.label} className="flex items-start gap-1.5">
                <span className={clsx('text-[9px] font-semibold uppercase w-10 shrink-0 pt-0.5', group.color)}>
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {group.fns.map(fn => (
                    <button
                      key={fn.label}
                      type="button"
                      title={fn.tip}
                      onClick={() => insertSnippet(fn.snippet)}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#2d2d30] text-[#969696] hover:bg-[#3c3c3c] hover:text-[#cccccc] border border-[#3c3c3c] hover:border-[#6a6a6a] transition-colors font-mono"
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
