/**
 * TransformChipEdge — used exclusively for the Join node's secondary (right) input edge.
 * Renders as a dashed, dimmed connector with a "Right source" label.
 *
 * All other edges between transformation chip nodes are plain styled arrows
 * (no chip overlay — the chip is the node itself now).
 */
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

export function TransformChipEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const isSecondary = !!(data?.isSecondaryJoin)
  const labelTransform = `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`

  if (isSecondary) {
    return (
      <>
        <path d={edgePath} className="pipeline-hit-area" />
        <path
          id={id}
          d={edgePath}
          className="transform-chip-edge-secondary react-flow__edge-path"
          markerEnd={markerEnd}
        />
        <EdgeLabelRenderer>
          {/* eslint-disable-next-line react/forbid-component-props */}
          <div className="transform-chip-anchor" style={{ transform: labelTransform }}>
            <span className="transform-chip-secondary-label">Right source</span>
          </div>
        </EdgeLabelRenderer>
      </>
    )
  }

  // Fallback: plain styled edge
  return (
    <>
      <path d={edgePath} className="pipeline-hit-area" />
      <path
        id={id}
        d={edgePath}
        className="transform-chip-edge-path react-flow__edge-path"
        markerEnd={markerEnd}
      />
    </>
  )
}
