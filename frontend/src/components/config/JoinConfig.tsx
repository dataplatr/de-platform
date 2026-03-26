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
        <label className="text-[10px] text-[#969696] uppercase tracking-wider">Join Type</label>
        <div className="flex gap-1 flex-wrap">
          {JOIN_TYPES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => set({ joinType: t })}
              className={`px-2 py-1 rounded text-[11px] transition-colors ${
                config.joinType === t
                  ? 'bg-[#0e639c] text-white'
                  : 'bg-[#2d2d30] text-[#969696] hover:bg-[#3c3c3c]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Connection hint */}
      <div className="bg-[#1e3a2b] border border-[#2e4a3b] rounded p-2 text-[11px] text-[#4ec9b0]">
        🔗 Connect <strong>Left</strong> (top handle) and <strong>Right</strong> (bottom handle) source nodes on the canvas.
      </div>

      {/* Join conditions */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#969696] uppercase tracking-wider">On</span>
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {config.conditions.length === 0 && (
          <p className="text-[11px] text-[#6a6a6a] italic">No conditions — will cross join.</p>
        )}

        {config.conditions.map((cond, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              value={cond.leftCol}
              onChange={e => updateCond(i, { leftCol: e.target.value })}
              className="flex-1 bg-[#2d2d30] border border-[#3c3c3c] text-[#9cdcfe] text-xs rounded px-1.5 py-1 outline-none"
            >
              {leftColumns.length === 0 && <option value="">-- connect left --</option>}
              {leftColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <span className="text-[#6a6a6a] text-xs shrink-0">=</span>
            <select
              value={cond.rightCol}
              onChange={e => updateCond(i, { rightCol: e.target.value })}
              className="flex-1 bg-[#2d2d30] border border-[#3c3c3c] text-[#4ec9b0] text-xs rounded px-1.5 py-1 outline-none"
            >
              {rightColumns.length === 0 && <option value="">-- connect right --</option>}
              {rightColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => removeCond(i)} className="p-1 rounded hover:bg-[#3a1e1e] text-[#6a6a6a] hover:text-[#f44747] transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
