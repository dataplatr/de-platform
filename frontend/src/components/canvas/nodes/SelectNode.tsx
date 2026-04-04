import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { SelectConfig } from '../../../types'

export const SelectNode = memo(function SelectNode({ id, data, selected }: NodeProps) {
  const cfg = data.config as SelectConfig | null

  const summary = cfg && cfg.columns.length > 0
    ? `${cfg.columns.length} col${cfg.columns.length !== 1 ? 's' : ''} selected`
    : 'All columns'

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="select"
      label={(data.label as string) ?? 'Select'}
      summary={summary}
      selected={selected}
    />
  )
})

SelectNode.displayName = 'SelectNode'
