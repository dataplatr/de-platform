import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { TransformConfig } from '../../../types'

export const TransformNode = memo(function TransformNode({ id, data, selected }: NodeProps) {
  const cfg = data.config as TransformConfig | null
  const count = cfg?.columns.filter(c => c.enabled).length ?? 0

  const summary = cfg && cfg.columns.length > 0
    ? `${count} transform${count !== 1 ? 's' : ''}`
    : 'Not configured'

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="transform"
      label={(data.label as string) ?? 'Transform'}
      summary={summary}
      selected={selected}
    />
  )
})

TransformNode.displayName = 'TransformNode'
