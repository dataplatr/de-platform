import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { JoinConfig } from '../../../types'

export const JoinNode = memo(function JoinNode({ id, data, selected }: NodeProps) {
  const cfg = data.config as JoinConfig | null

  const summary = cfg
    ? `${cfg.joinType} · ${cfg.conditions.length} cond${cfg.conditions.length !== 1 ? 's' : ''}`
    : 'Not configured'

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="join"
      label={(data.label as string) ?? 'Join'}
      summary={summary}
      selected={selected}
      inputMode="dual"
    />
  )
})

JoinNode.displayName = 'JoinNode'
