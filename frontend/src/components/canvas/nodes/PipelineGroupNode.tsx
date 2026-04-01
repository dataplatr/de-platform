import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

interface PipelineGroupData {
  width: number
  height: number
  onClose: () => void
  srcLabel?: string
  outLabel?: string
}

export const PipelineGroupNode = memo(function PipelineGroupNode({ data }: NodeProps) {
  const d = data as unknown as PipelineGroupData

  return (
    <div
      className="pipeline-group-node"
      style={{ width: d.width, height: d.height }}
    >
      <div className="pipeline-group-header">
        <span className="pipeline-group-label">
          {d.srcLabel && d.outLabel ? `${d.srcLabel} → ${d.outLabel}` : 'Transformation Steps'}
        </span>
        <button
          type="button"
          className="pipeline-group-close"
          onClick={(e) => { e.stopPropagation(); d.onClose() }}
          title="Collapse pipeline"
        >
          ✕
        </button>
      </div>
    </div>
  )
})
