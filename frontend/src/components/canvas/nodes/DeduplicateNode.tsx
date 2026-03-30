import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { TransformNode as TNode, DeduplicateConfig } from '../../../types'

export const DeduplicateNode = memo(({ data, selected }: NodeProps) => {
  const node = data as TNode
  const cfg = node.config as DeduplicateConfig | null

  return (
    <BaseNode
      label={node.label}
      icon="⊘"
      colorClass="bg-[#2b2b1e]"
      borderColorClass="border-[#4a4a2e]"
      selected={selected}
      status={node.status ?? 'idle'}
    >
      {cfg && cfg.partitionBy.length > 0 ? (
        <div className="flex flex-col gap-0.5 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-[#6a6a6a]">On:</span>
            <span className="text-[#dcdcaa] font-mono truncate">
              {cfg.partitionBy.join(', ')}
            </span>
          </div>
          {cfg.orderBy && (
            <div className="flex items-center gap-1">
              <span className="text-[#6a6a6a]">Order:</span>
              <span className="text-[#9cdcfe] font-mono">{cfg.orderBy}</span>
              <span className="text-[#6a6a6a]">{cfg.orderDir}</span>
            </div>
          )}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic text-[10px]">DISTINCT *</span>
      )}
    </BaseNode>
  )
})

DeduplicateNode.displayName = 'DeduplicateNode'
