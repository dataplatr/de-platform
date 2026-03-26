import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'

export function SourceNode({ data, selected }: NodeProps) {
  const nodeData = data as { label?: string; tableRef?: string; status?: 'idle' | 'running' | 'success' | 'error' }
  return (
    <BaseNode
      label={nodeData.label ?? 'Source'}
      icon="🗃️"
      colorClass="bg-[#1e3a5f]"
      borderColorClass="border-[#1e4a7a]"
      hasInput={false}
      selected={selected}
      status={nodeData.status}
    >
      {nodeData.tableRef && (
        <span className="text-[#4fc1ff] font-mono text-[10px]">{nodeData.tableRef}</span>
      )}
    </BaseNode>
  )
}
