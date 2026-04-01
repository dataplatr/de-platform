import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'

export const SourceNode = memo(function SourceNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; tableRef?: string; status?: 'idle' | 'running' | 'success' | 'error' }
  return (
    <BaseNode
      label={nodeData.label ?? 'Source'}
      icon="🗃️"
      nodeClass="node-source"
      hasInput={false}
      selected={selected}
      status={nodeData.status}
    >
      {nodeData.tableRef && (
        <span className="text-[#4fc1ff] font-mono text-[10px]">{nodeData.tableRef}</span>
      )}
    </BaseNode>
  )
})
