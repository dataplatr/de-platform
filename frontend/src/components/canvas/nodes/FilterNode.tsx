import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { TransformChipNode } from './TransformChipNode'
import type { FilterCondition } from '../../../types'

export const FilterNode = memo(function FilterNode({ id, data, selected }: NodeProps) {
  const conditions = (data.config as FilterCondition[] | null) ?? []

  let summary: string
  if (conditions.length === 0) {
    summary = 'No conditions'
  } else if (conditions.length === 1) {
    const c = conditions[0]
    const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')
    summary = `${c.column} ${c.operator} ${val}`
  } else {
    summary = `${conditions.length} conditions`
  }

  return (
    <TransformChipNode
      nodeId={id}
      nodeType="filter"
      label={(data.label as string) ?? 'Filter'}
      summary={summary}
      selected={selected}
    />
  )
})

FilterNode.displayName = 'FilterNode'
