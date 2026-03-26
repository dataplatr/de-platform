import { useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { AggregationConfig, Column } from '../../types'

const FUNCS = ['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'] as const

interface Props { nodeId: string; config: AggregationConfig; columns: Column[] }

export function AggregateConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback((patch: Partial<AggregationConfig>) => {
    updateNode(nodeId, { config: { ...config, ...patch } })
  }, [nodeId, config, updateNode])

  const toggleGroupBy = (col: string) => {
    const has = config.groupBy.includes(col)
    set({ groupBy: has ? config.groupBy.filter(c => c !== col) : [...config.groupBy, col] })
  }

  const addMeasure = () => {
    const col = columns.find(c => !config.groupBy.includes(c.name))?.name ?? columns[0]?.name ?? ''
    set({
      measures: [...config.measures, { column: col, func: 'COUNT', alias: '' }],
    })
  }

  const updateMeasure = (i: number, patch: Partial<AggregationConfig['measures'][number]>) => {
    set({ measures: config.measures.map((m, idx) => idx === i ? { ...m, ...patch } : m) })
  }

  const removeMeasure = (i: number) => {
    set({ measures: config.measures.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Group By */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] text-[#969696] uppercase tracking-wider">Group By</span>
        {columns.length === 0 && (
          <p className="text-[11px] text-[#6a6a6a] italic">Connect a source node first.</p>
        )}
        <div className="flex flex-wrap gap-1">
          {columns.map(col => {
            const active = config.groupBy.includes(col.name)
            return (
              <button
                key={col.name}
                type="button"
                onClick={() => toggleGroupBy(col.name)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  active ? 'bg-[#0e639c] text-white' : 'bg-[#2d2d30] text-[#969696] hover:bg-[#3c3c3c]'
                }`}
              >
                {col.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Measures */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#969696] uppercase tracking-wider">Measures</span>
          <button
            type="button"
            onClick={addMeasure}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#2b1e3a] hover:bg-[#3b2e4a] border border-[#4a3a5a] text-[#c39dff] transition-colors"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {config.measures.length === 0 && (
          <p className="text-[11px] text-[#6a6a6a] italic">No measures — will only group.</p>
        )}

        {config.measures.map((m, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={m.func}
              onChange={e => updateMeasure(i, { func: e.target.value as typeof FUNCS[number] })}
              className="bg-[#2b1e3a] border border-[#4a3a5a] text-[#c39dff] text-xs rounded px-1.5 py-1 outline-none"
            >
              {FUNCS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="text-[#6a6a6a]">(</span>
            <select
              value={m.column}
              onChange={e => updateMeasure(i, { column: e.target.value })}
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
            <button type="button" onClick={() => removeMeasure(i)} className="p-1 rounded hover:bg-[#3a1e1e] text-[#6a6a6a] hover:text-[#f44747] transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
