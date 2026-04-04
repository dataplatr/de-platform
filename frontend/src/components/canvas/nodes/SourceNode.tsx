import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { DataObjectNode, type DataObjectVariant } from './DataObjectNode'
import type { TransformNode } from '../../../types'

export const SourceNode = memo(function SourceNode({ data, selected }: NodeProps) {
  const d = data as TransformNode
  const variant: DataObjectVariant = d.sourceType ?? 'table'
  const colCount = d.columns?.length
  const description = d.tableRef && d.tableRef !== d.label ? d.tableRef : undefined

  return (
    <DataObjectNode
      variant={variant}
      label={d.label}
      colCount={colCount}
      description={description}
      selected={selected}
      hasInput={false}
      hasOutput
    />
  )
})
