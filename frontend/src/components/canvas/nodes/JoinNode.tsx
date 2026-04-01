import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { JoinConfig } from '../../../types'

export const JoinNode = memo(function JoinNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; config?: JoinConfig; status?: 'idle' | 'running' | 'success' | 'error' }
  const cfg = nodeData.config

  return (
    <BaseNode
      label={nodeData.label ?? 'Join'}
      icon="🔗"
      nodeClass="node-join"
      hasInput="dual"
      selected={selected}
      status={nodeData.status}
    >
      {cfg ? (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-[#dcdcaa]">{cfg.joinType}</span>
            <span className="text-[#6a6a6a] text-[9px] ml-1">({cfg.conditions.length} cond)</span>
          </div>
          {cfg.conditions.slice(0, 1).map((c, i) => (
            <div key={i} className="text-[10px] text-[#969696] font-mono truncate">
              {c.leftCol} = {c.rightCol}
            </div>
          ))}
          {/* Handle labels */}
          <div className="flex flex-col gap-0.5 mt-1 border-t border-white/10 pt-1">
            <div className="flex items-center gap-1 text-[9px]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4ec9b0]" />
              <span className="text-[#4ec9b0]">L</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#dcdcaa] ml-1" />
              <span className="text-[#dcdcaa]">R</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          <span className="text-[#6a6a6a] italic text-[10px]">Not configured</span>
          <div className="flex items-center gap-1 text-[9px] mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4ec9b0]" />
            <span className="text-[#4ec9b0]">Left</span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#dcdcaa] ml-1" />
            <span className="text-[#dcdcaa]">Right</span>
          </div>
        </div>
      )}
    </BaseNode>
  )
})
