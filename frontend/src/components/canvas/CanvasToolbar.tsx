import { useCallback } from 'react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformNode } from '../../types'

const NODE_DEFS: { type: TransformNode['type']; label: string; icon: string; color: string }[] = [
  { type: 'source',    label: 'Source',    icon: '🗃️', color: 'bg-[#1e3a5f] hover:bg-[#1e4a7a]' },
  { type: 'filter',    label: 'Filter',    icon: '🔽', color: 'bg-[#3a2b1e] hover:bg-[#4a3b2e]' },
  { type: 'join',      label: 'Join',      icon: '🔗', color: 'bg-[#1e3a2b] hover:bg-[#2e4a3b]' },
  { type: 'aggregate', label: 'Aggregate', icon: '∑',  color: 'bg-[#2b1e3a] hover:bg-[#3b2e4a]' },
  { type: 'select',    label: 'Select',    icon: '📋', color: 'bg-[#1e2b3a] hover:bg-[#2e3b4a]' },
]

function makeId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function CanvasToolbar() {
  const { addNode, nodes } = useTransformationStore()

  const addNodeType = useCallback((type: TransformNode['type']) => {
    const offset = nodes.length * 20
    const base = { source: 100, filter: 320, join: 540, aggregate: 760, select: 980 }
    addNode({
      id: makeId(),
      type,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${nodes.filter(n => n.type === type).length + 1}`,
      config: type === 'filter' ? [] : type === 'aggregate' ? { groupBy: [], measures: [] } : type === 'select' ? { columns: [] } : type === 'join' ? { joinType: 'INNER', conditions: [], rightTable: '' } : null,
      position: { x: (base[type] ?? 100) + offset, y: 200 + offset },
    })
  }, [addNode, nodes])

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
      <span className="text-[10px] text-[#6a6a6a] uppercase tracking-wider mr-1">Add:</span>
      {NODE_DEFS.map(({ type, label, icon, color }) => (
        <button
          key={type}
          type="button"
          onClick={() => addNodeType(type)}
          title={`Add ${label} node`}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[#cccccc] transition-colors ${color}`}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
