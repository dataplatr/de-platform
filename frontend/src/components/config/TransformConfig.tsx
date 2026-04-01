import { useCallback, useState, useRef, useEffect } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformConfig as Cfg, TransformColumnDef, Column } from '../../types'
import clsx from 'clsx'

const CAST_TYPES = ['', 'VARCHAR', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP']

const FN_GROUPS = [
  {
    label: 'String',
    color: 'text-[var(--accent-fg)]',
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
    color: 'text-[var(--step-filter)]',
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
    color: 'text-[var(--step-aggregate)]',
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
    color: 'text-[var(--success)]',
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
    setSelectedIdx(config.columns.length)
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
    return <p className="text-[11px] text-muted italic p-2">Connect a source node first.</p>
  }

  const filtered = config.columns.filter(row =>
    !searchQuery || row.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.outputName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedRow = selectedIdx !== null ? config.columns[selectedIdx] : null
  const enabledCount = config.columns.filter(c => c.enabled).length

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Top bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-theme shrink-0">
        <Search size={11} className="text-muted shrink-0" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter columns…"
          aria-label="Filter columns"
          className="flex-1 bg-transparent text-[11px] text-primary outline-none placeholder-[var(--text-3)]"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} title="Clear filter">
            <X size={10} className="text-muted" />
          </button>
        )}
        <span className="text-[10px] text-muted shrink-0">{enabledCount}/{config.columns.length}</span>
        <button type="button" onClick={() => toggleAll(true)}
          className="text-[10px] text-[var(--accent-fg)] hover:underline shrink-0">All</button>
        <button type="button" onClick={() => toggleAll(false)}
          className="text-[10px] text-secondary hover:underline shrink-0">None</button>
      </div>

      {/* Column table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {/* Header */}
        <div className="transform-col-grid grid px-2 py-0.5 text-[9px] text-muted uppercase tracking-wider sticky top-0 bg-surface border-b border-theme">
          <span />
          <span>Source</span>
          <span>Output name</span>
          <span>Cast</span>
          <span />
        </div>

        {(searchQuery ? filtered : config.columns).map((row, _i) => {
          const i = searchQuery ? config.columns.indexOf(row) : _i
          const isSelected = selectedIdx === i
          const hasExpr = !!row.expression

          return (
            <div
              key={i}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className={clsx(
                'transform-col-grid grid items-center px-2 py-0.5 cursor-pointer transition-colors border-b border-theme transform-col-row',
                'hover:bg-elevated',
                isSelected && 'bg-[var(--selected-bg)] hover:bg-[var(--selected-bg)]',
                !row.enabled && 'opacity-40'
              )}
            >
              <input type="checkbox" checked={row.enabled}
                onChange={e => { e.stopPropagation(); update(i, { enabled: e.target.checked }) }}
                className="accent-[var(--accent)] cursor-pointer"
                title="Include in output"
              />

              <div className="flex items-center gap-1 min-w-0">
                <span className={clsx(
                  'text-[11px] font-mono truncate',
                  row.source ? (isSelected ? 'text-primary' : 'text-[var(--step-select)]') : 'text-[var(--step-transform)] italic'
                )}>
                  {row.source || 'derived'}
                </span>
                {hasExpr && (
                  <span className="text-[9px] text-[var(--step-transform)] shrink-0" title="Has expression">⚡</span>
                )}
              </div>

              <input
                type="text"
                value={row.outputName}
                onClick={e => e.stopPropagation()}
                onChange={e => update(i, { outputName: e.target.value })}
                disabled={!row.enabled}
                placeholder={row.source || 'col_name'}
                className={clsx(
                  'bg-transparent text-[11px] font-mono outline-none w-full truncate',
                  'border-b border-transparent focus:border-[var(--accent-fg)] transition-colors',
                  row.outputName !== row.source ? 'text-[var(--step-filter)]' : 'text-muted',
                  !row.enabled && 'cursor-not-allowed'
                )}
              />

              <select
                value={row.castType}
                onClick={e => e.stopPropagation()}
                onChange={e => update(i, { castType: e.target.value })}
                disabled={!row.enabled}
                title="Cast type"
                className="bg-transparent text-[10px] text-muted outline-none w-full cursor-pointer disabled:cursor-not-allowed"
              >
                {CAST_TYPES.map(t => <option key={t} value={t}>{t || 'No cast'}</option>)}
              </select>

              <button type="button" onClick={e => removeRow(i, e)}
                title="Remove column"
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-error hover:bg-[var(--node-filter-bg)] transition-colors text-muted">
                <X size={10} />
              </button>
            </div>
          )
        })}

        <button type="button" onClick={addDerived}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted hover:text-[var(--step-transform)] hover:bg-elevated transition-colors border-t border-theme">
          <Plus size={11} />
          Add derived column
        </button>
      </div>

      {/* Detail panel */}
      {selectedRow && (
        <div className="shrink-0 border-t border-theme bg-app">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-theme">
            <span className="text-[10px] text-secondary">
              Expression for{' '}
              <span className="text-[var(--step-filter)] font-mono">{selectedRow.outputName || selectedRow.source}</span>
            </span>
            {selectedRow.expression && (
              <button type="button" onClick={() => update(selectedIdx!, { expression: '' })}
                className="text-[10px] text-muted hover:text-error" title="Clear expression">
                Clear
              </button>
            )}
          </div>

          <div className="px-3 py-2">
            <input
              ref={exprRef}
              type="text"
              value={selectedRow.expression}
              onChange={e => update(selectedIdx!, { expression: e.target.value })}
              placeholder={selectedRow.source ? `${selectedRow.source} (passthrough)` : 'SQL expression…'}
              className="w-full bg-elevated border border-theme focus:border-[var(--accent-fg)] text-[var(--step-transform)] text-[11px] font-mono rounded px-2 py-1.5 outline-none transition-colors placeholder-[var(--text-3)]"
            />
            {selectedRow.expression && (
              <p className="text-[9px] text-muted mt-1 font-mono truncate">
                → {selectedRow.expression} AS {selectedRow.outputName || selectedRow.source}
              </p>
            )}
          </div>

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
