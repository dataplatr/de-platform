import { useState } from 'react'
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { useTransformationStore } from '../../../store/transformationStore'
import clsx from 'clsx'
import { NODE_META } from '../../../constants/nodeMetadata'

interface PipelineStep {
  type: string
  label: string
}

export function PipelineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const { setRightPanelTab } = useTransformationStore()
  const [isHovered, setIsHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const steps = (data?.steps as PipelineStep[]) ?? []
  const stepCount = steps.length
  const onExpand = data?.onExpand as (() => void) | undefined

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onExpand) {
      onExpand()
    } else {
      setRightPanelTab('history')
    }
  }

  const hover = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  }

  // The EdgeLabelRenderer `transform` must be inline — it uses dynamic coordinates
  // from ReactFlow's getBezierPath and cannot be expressed as a static CSS class.
  const labelTransform = `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`

  return (
    <>
      {/* Wide transparent hit area */}
      <path d={edgePath} className="pipeline-hit-area" onClick={handleClick} {...hover} />

      {/* Visible path */}
      <path
        id={id}
        d={edgePath}
        className={clsx('pipeline-edge-path react-flow__edge-path', isHovered && 'hovered')}
        onClick={handleClick}
        markerEnd={markerEnd}
        {...hover}
      />

      {/* Hover-only label pill */}
      {isHovered && (
        <EdgeLabelRenderer>
          {/* eslint-disable-next-line react/forbid-component-props */}
          <div
            className="pipeline-edge-label-anchor"
            style={{ transform: labelTransform }}
            onClick={handleClick}
            {...hover}
          >
            <div
              className="pipeline-edge-pill"
              title={onExpand ? 'Click to expand steps inline' : 'Click to view steps'}
            >
              {stepCount === 0 ? (
                <span className="opacity-70">+ add steps</span>
              ) : (
                <>
                  {steps.slice(0, 4).map((s, i) => (
                    <span key={i} title={s.label}>
                      {NODE_META[s.type as keyof typeof NODE_META]?.icon ?? '⬡'}
                    </span>
                  ))}
                  {steps.length > 4 && <span className="opacity-70">+{steps.length - 4}</span>}
                  <span className="pipeline-edge-badge">{stepCount}</span>
                </>
              )}
              {onExpand && <span className="opacity-50 text-[10px]">⤢</span>}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
