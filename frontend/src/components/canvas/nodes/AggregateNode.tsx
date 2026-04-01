import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { AggregationConfig } from '../../../types'

export const AggregateNode = memo(function AggregateNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; config?: AggregationConfig; status?: 'idle' | 'running' | 'success' | 'error' }
  const cfg = nodeData.config

  return (
    <BaseNode
      label={nodeData.label ?? 'Aggregate'}
      icon="∑"
      nodeClass="node-aggregate"
      selected={selected}
      status={nodeData.status}
    >
      {cfg ? (
        <div className="space-y-0.5">
          <div className="text-[10px] text-[#6a6a6a]">
            Group by: <span className="text-[#9cdcfe]">{cfg.groupBy.join(', ')}</span>
          </div>
          {cfg.measures.slice(0, 2).map((m, i) => (
            <div key={i} className="text-[10px] font-mono">
              <span className="text-[#dcdcaa]">{m.func}</span>
              <span className="text-[#6a6a6a]">(</span>
              <span className="text-[#9cdcfe]">{m.column}</span>
              <span className="text-[#6a6a6a]">)</span>
              {m.alias && <span className="text-[#969696]"> → {m.alias}</span>}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic">Not configured</span>
      )}
    </BaseNode>
  )
})
