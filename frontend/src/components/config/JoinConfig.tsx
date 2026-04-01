import { useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { JoinConfig as JoinCfg, Column } from '../../types'

const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER'] as const

interface Props {
  nodeId: string
  config: JoinCfg
  leftColumns: Column[]
  rightColumns: Column[]
}

export function JoinConfig({ nodeId, config, leftColumns, rightColumns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback((patch: Partial<JoinCfg>) => {
    updateNode(nodeId, { config: { ...config, ...patch } })
  }, [nodeId, config, updateNode])

  const addCondition = () => {
    set({
      conditions: [
        ...config.conditions,
        { leftCol: leftColumns[0]?.name ?? '', rightCol: rightColumns[0]?.name ?? '' },
      ],
    })
  }

  const updateCond = (i: number, patch: { leftCol?: string; rightCol?: string }) => {
    const updated = config.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    set({ conditions: updated })
  }

  const removeCond = (i: number) => {
    set({ conditions: config.conditions.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Join type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-secondary uppercase tracking-wider">Join Type</label>
        <div className="flex gap-1 flex-wrap">
          {JOIN_TYPES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => set({ joinType: t })}
              className={`px-2 py-1 rounded text-[11px] transition-colors ${
                config.joinType === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-elevated text-secondary hover:bg-[var(--bg-input)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Connection hint */}
      <div className="bg-[var(--node-join-bg)] border border-[var(--node-join-border)] rounded p-2 text-[11px] text-[var(--success)]">
        🔗 Connect <strong>Left</strong> (top handle) and <strong>Right</strong> (bottom handle) source nodes on the canvas.
      </div>

      {/* Join conditions */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-secondary uppercase tracking-wider">On</span>
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {config.conditions.length === 0 && (
          <p className="text-[11px] text-muted italic">No conditions — will cross join.</p>
        )}

        {config.conditions.map((cond, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={cond.leftCol}
              onChange={e => updateCond(i, { leftCol: e.target.value })}
              className="flex-1 bg-elevated border border-theme text-[var(--step-select)] text-xs rounded px-1.5 py-1 outline-none"
            >
              {leftColumns.length === 0 && <option value="">-- connect left --</option>}
              {leftColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <span className="text-muted text-xs shrink-0">=</span>
            <select
              value={cond.rightCol}
              onChange={e => updateCond(i, { rightCol: e.target.value })}
              className="flex-1 bg-elevated border border-theme text-[var(--success)] text-xs rounded px-1.5 py-1 outline-none"
            >
              {rightColumns.length === 0 && <option value="">-- connect right --</option>}
              {rightColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => removeCond(i)} className="p-1 rounded hover:bg-[var(--node-filter-bg)] text-muted hover:text-error transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
