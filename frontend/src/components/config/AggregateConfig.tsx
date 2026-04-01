import { useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { MultiSelectDropdown } from '../common/MultiSelectDropdown'
import type { AggregationConfig, Column } from '../../types'

const FUNCS = ['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'] as const

interface Props { nodeId: string; config: AggregationConfig; columns: Column[] }

export function AggregateConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback((patch: Partial<AggregationConfig>) => {
    updateNode(nodeId, { config: { ...config, ...patch } })
  }, [nodeId, config, updateNode])

  const addMeasure = () => {
    const col = columns.find(c => !config.groupBy.includes(c.name))?.name ?? columns[0]?.name ?? ''
    set({ measures: [...config.measures, { column: col, func: 'SUM', alias: '' }] })
  }

  const updateMeasure = (i: number, patch: Partial<AggregationConfig['measures'][number]>) => {
    set({ measures: config.measures.map((m, idx) => idx === i ? { ...m, ...patch } : m) })
  }

  const removeMeasure = (i: number) => {
    set({ measures: config.measures.filter((_, idx) => idx !== i) })
  }

  const names = columns.map(c => c.name)

  return (
    <div className="flex flex-col gap-4">
      {/* Group By */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-secondary uppercase tracking-wider">Group By</span>
        {names.length === 0 ? (
          <p className="text-[11px] text-muted italic">Connect a source node first.</p>
        ) : (
          <MultiSelectDropdown
            options={names}
            selected={config.groupBy}
            onChange={v => set({ groupBy: v })}
            placeholder="Select group-by columns…"
            accent="text-[var(--accent-fg)]"
          />
        )}
      </div>

      {/* Measures */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-secondary uppercase tracking-wider">Measures</span>
          <button
            type="button"
            onClick={addMeasure}
            disabled={names.length === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--node-aggregate-bg)] hover:bg-[var(--node-aggregate-border)] border border-[var(--node-aggregate-border)] text-[var(--step-aggregate)] transition-colors disabled:opacity-40"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {config.measures.length === 0 && (
          <p className="text-[11px] text-muted italic">No measures — will group only.</p>
        )}

        {config.measures.map((m, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={m.func}
              onChange={e => updateMeasure(i, { func: e.target.value as typeof FUNCS[number] })}
              title="Aggregation function"
              className="bg-[var(--node-aggregate-bg)] border border-[var(--node-aggregate-border)] text-[var(--step-aggregate)] text-xs rounded px-1.5 py-1 outline-none"
            >
              {FUNCS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="text-muted">(</span>
            <select
              value={m.column}
              onChange={e => updateMeasure(i, { column: e.target.value })}
              title="Column to aggregate"
              className="flex-1 bg-elevated border border-theme text-[var(--step-select)] text-xs rounded px-1.5 py-1 outline-none"
            >
              {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <span className="text-muted">)</span>
            <input
              type="text"
              value={m.alias ?? ''}
              onChange={e => updateMeasure(i, { alias: e.target.value })}
              placeholder="alias"
              className="w-20 bg-elevated border border-theme text-secondary text-xs rounded px-1.5 py-1 outline-none"
            />
            <button type="button" onClick={() => removeMeasure(i)}
              title="Remove measure"
              className="p-1 rounded hover:bg-[var(--node-filter-bg)] text-muted hover:text-error transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
