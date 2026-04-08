import { useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { FilterCondition, Column } from '../../types'

const OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'IN',
  'NOT IN',
  'IS NULL',
  'IS NOT NULL',
] as const
const makeId = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`

interface Props {
  nodeId: string
  config: FilterCondition[]
  columns: Column[]
}

export function FilterConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback(
    (conditions: FilterCondition[]) => {
      updateNode(nodeId, { config: conditions })
    },
    [nodeId, updateNode]
  )

  const addCondition = () => {
    set([
      ...config,
      { id: makeId(), column: columns[0]?.name ?? '', operator: '=', value: '', logic: 'AND' },
    ])
  }

  const update = (id: string, patch: Partial<FilterCondition>) => {
    set(config.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const remove = (id: string) => {
    set(config.filter((c) => c.id !== id))
  }

  const noValue = (op: string) => op === 'IS NULL' || op === 'IS NOT NULL'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-secondary uppercase tracking-wider">Conditions</span>
        <button
          type="button"
          onClick={addCondition}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>

      {config.length === 0 && (
        <p className="text-[11px] text-muted italic">No conditions — all rows pass through.</p>
      )}

      <div className="flex flex-col gap-2">
        {config.map((cond, i) => (
          <div key={cond.id} className="flex flex-col gap-1 bg-app border border-theme rounded p-2">
            {i > 0 && (
              <select
                value={cond.logic ?? 'AND'}
                onChange={(e) => update(cond.id, { logic: e.target.value as 'AND' | 'OR' })}
                className="self-start bg-elevated text-[var(--step-filter)] text-[10px] rounded px-1 py-0.5 outline-none border-none"
              >
                <option>AND</option>
                <option>OR</option>
              </select>
            )}
            <div className="flex items-center gap-1">
              {/* Column */}
              <select
                value={cond.column}
                onChange={(e) => update(cond.id, { column: e.target.value })}
                className="flex-1 bg-elevated border border-theme text-[var(--step-select)] text-xs rounded px-1.5 py-1 outline-none"
              >
                {columns.length === 0 && <option value="">-- connect source --</option>}
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {/* Operator */}
              <select
                value={cond.operator}
                onChange={(e) =>
                  update(cond.id, { operator: e.target.value as FilterCondition['operator'] })
                }
                className="bg-elevated border border-theme text-primary text-xs rounded px-1.5 py-1 outline-none"
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {/* Delete */}
              <button
                type="button"
                onClick={() => remove(cond.id)}
                className="p-1 rounded hover:bg-[var(--node-filter-bg)] text-muted hover:text-error transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            {/* Value */}
            {!noValue(cond.operator) && (
              <input
                type="text"
                value={String(cond.value ?? '')}
                onChange={(e) => update(cond.id, { value: e.target.value })}
                placeholder={cond.operator === 'IN' ? 'val1, val2, val3' : 'value'}
                className="bg-elevated border border-theme text-[var(--step-transform)] text-xs rounded px-2 py-1 outline-none focus:border-[var(--accent)] w-full"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
