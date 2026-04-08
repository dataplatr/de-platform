import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { DataObjectNode, type DataObjectVariant } from './DataObjectNode'
import { useTransformationStore } from '../../../store/transformationStore'
import type { TransformNode } from '../../../types'

export const SourceNode = memo(function SourceNode({ data, selected }: NodeProps) {
  const d = data as TransformNode
  const { connections } = useTransformationStore()

  const variant: DataObjectVariant = d.sourceType ?? 'table'
  const colCount = d.columns?.length
  const description = d.tableRef && d.tableRef !== d.label ? d.tableRef : undefined

  // Check if the connection alias this node references is still available
  const connectionMissing =
    !!d.connection_alias &&
    connections.length > 0 &&
    !connections.find(c => c.alias === d.connection_alias)

  return (
    <DataObjectNode
      variant={variant}
      label={d.label}
      colCount={colCount}
      description={description}
      selected={selected}
      hasInput={false}
      hasOutput
      errorMessage={connectionMissing ? `⚠ Connection missing: ${d.connection_alias}` : undefined}
    />
  )
})
