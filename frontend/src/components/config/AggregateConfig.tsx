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
    // Default to first column not already used as groupBy
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
      {/* Group By — multi-select dropdown */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-[#969696] uppercase tracking-wider">Group By</span>
        {names.length === 0 ? (
          <p className="text-[11px] text-[#6a6a6a] italic">Connect a source node first.</p>
        ) : (
          <MultiSelectDropdown
            options={names}
            selected={config.groupBy}
            onChange={v => set({ groupBy: v })}
            placeholder="Select group-by columns…"
            accent="text-[#4fc1ff]"
          />
        )}
      </div>

      {/* Measures */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#969696] uppercase tracking-wider">Measures</span>
          <button
            type="button"
            onClick={addMeasure}
            disabled={names.length === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#2b1e3a] hover:bg-[#3b2e4a] border border-[#4a3a5a] text-[#c39dff] transition-colors disabled:opacity-40"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {config.measures.length === 0 && (
          <p className="text-[11px] text-[#6a6a6a] italic">No measures — will group only.</p>
        )}

        {config.measures.map((m, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={m.func}
              onChange={e => updateMeasure(i, { func: e.target.value as typeof FUNCS[number] })}
              title="Aggregation function"
              className="bg-[#2b1e3a] border border-[#4a3a5a] text-[#c39dff] text-xs rounded px-1.5 py-1 outline-none"
            >
              {FUNCS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="text-[#6a6a6a]">(</span>
            <select
              value={m.column}
              onChange={e => updateMeasure(i, { column: e.target.value })}
              title="Column to aggregate"
              className="flex-1 bg-[#2d2d30] border border-[#3c3c3c] text-[#9cdcfe] text-xs rounded px-1.5 py-1 outline-none"
            >
              {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <span className="text-[#6a6a6a]">)</span>
            <input
              type="text"
              value={m.alias ?? ''}
              onChange={e => updateMeasure(i, { alias: e.target.value })}
              placeholder="alias"
              className="w-20 bg-[#2d2d30] border border-[#3c3c3c] text-[#969696] text-xs rounded px-1.5 py-1 outline-none"
            />
            <button type="button" onClick={() => removeMeasure(i)}
              title="Remove measure"
              className="p-1 rounded hover:bg-[#3a1e1e] text-[#6a6a6a] hover:text-[#f44747] transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
