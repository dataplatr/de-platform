import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { FilterCondition } from '../../../types'

export const FilterNode = memo(function FilterNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; config?: FilterCondition[]; status?: 'idle' | 'running' | 'success' | 'error' }
  const conditions = nodeData.config ?? []

  return (
    <BaseNode
      label={nodeData.label ?? 'Filter'}
      icon="🔽"
      nodeClass="node-filter"
      selected={selected}
      status={nodeData.status}
    >
      {conditions.length > 0 ? (
        <div className="space-y-0.5">
          {conditions.slice(0, 2).map((c: FilterCondition, i: number) => (
            <div key={c.id} className="flex items-center gap-1 text-[10px]">
              {i > 0 && <span className="text-[#dcdcaa] text-[9px]">{c.logic ?? 'AND'}</span>}
              <span className="text-[#9cdcfe]">{c.column}</span>
              <span className="text-[#6a6a6a]">{c.operator}</span>
              <span className="text-[#ce9178]">{String(c.value)}</span>
            </div>
          ))}
          {conditions.length > 2 && (
            <div className="text-[10px] text-[#6a6a6a]">+{conditions.length - 2} more</div>
          )}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic">No conditions</span>
      )}
    </BaseNode>
  )
})
