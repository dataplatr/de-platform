import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { JoinConfig } from '../../../types'

export function JoinNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; config?: JoinConfig; status?: 'idle' | 'running' | 'success' | 'error' }
  const cfg = nodeData.config

  return (
    <BaseNode
      label={nodeData.label ?? 'Join'}
      icon="🔗"
      colorClass="bg-[#1e3a2b]"
      borderColorClass="border-[#2e4a3b]"
      selected={selected}
      status={nodeData.status}
    >
      {cfg ? (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-[#dcdcaa]">{cfg.joinType}</span>
            <span className="text-[#6a6a6a]">→</span>
            <span className="text-[#4ec9b0] truncate">{cfg.rightTable}</span>
          </div>
          {cfg.conditions.slice(0, 1).map((c, i) => (
            <div key={i} className="text-[10px] text-[#969696] font-mono">
              {c.leftCol} = {c.rightCol}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic">Not configured</span>
      )}
    </BaseNode>
  )
}
