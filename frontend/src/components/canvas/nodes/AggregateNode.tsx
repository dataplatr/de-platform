import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { AggregationConfig } from '../../../types'

export const AggregateNode = memo(function AggregateNode({ id, data, selected }: NodeProps) {
  const cfg = data.config as AggregationConfig | null

  let summary: string
  if (!cfg) {
    summary = 'Not configured'
  } else {
    const gb = cfg.groupBy.slice(0, 2).join(', ') || '—'
    summary = `GROUP BY ${gb} · ${cfg.measures.length}m`
  }

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="aggregate"
      label={(data.label as string) ?? 'Aggregate'}
      summary={summary}
      selected={selected}
    />
  )
})

AggregateNode.displayName = 'AggregateNode'
