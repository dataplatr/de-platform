import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { DeduplicateConfig } from '../../../types'

export const DeduplicateNode = memo(function DeduplicateNode({ id, data, selected }: NodeProps) {
  const cfg = data.config as DeduplicateConfig | null

  const summary =
    !cfg || cfg.partitionBy.length === 0
      ? 'DISTINCT *'
      : `BY ${cfg.partitionBy.slice(0, 2).join(', ')}`

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="deduplicate"
      label={(data.label as string) ?? 'Deduplicate'}
      summary={summary}
      selected={selected}
    />
  )
})

DeduplicateNode.displayName = 'DeduplicateNode'
