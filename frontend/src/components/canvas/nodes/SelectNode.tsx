import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { SelectConfig } from '../../../types'

export const SelectNode = memo(function SelectNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; config?: SelectConfig; status?: 'idle' | 'running' | 'success' | 'error' }
  const cfg = nodeData.config

  return (
    <BaseNode
      label={nodeData.label ?? 'Select'}
      icon="📋"
      nodeClass="node-select"
      selected={selected}
      status={nodeData.status}
    >
      {cfg && cfg.columns.length > 0 ? (
        <div className="space-y-0.5">
          {cfg.columns.slice(0, 3).map((c, i) => (
            <div key={i} className="text-[10px] text-[#9cdcfe] font-mono">
              {c.alias ? `${c.source} → ${c.alias}` : c.source}
            </div>
          ))}
          {cfg.columns.length > 3 && (
            <div className="text-[10px] text-[#6a6a6a]">+{cfg.columns.length - 3} more</div>
          )}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic">All columns</span>
      )}
    </BaseNode>
  )
})
