/**
 * DataObjectNode — shared visual for source and output data objects.
 * Renders as a PRD §9.4-spec card: TABLE (blue), VIEW (purple dashed),
 * CSV FILE (green), or OUTPUT (dark blue).
 *
 * All transformation-specific logic lives in the consuming node components
 * (SourceNode, OutputNode). This component is purely visual.
 */
import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'

export type DataObjectVariant = 'table' | 'view' | 'csv' | 'output'

const BADGE_TEXT: Record<DataObjectVariant, string> = {
  table:  'TABLE',
  view:   'VIEW',
  csv:    'CSV FILE',
  output: 'OUTPUT',
}

interface DataObjectNodeProps {
  variant: DataObjectVariant
  label: string
  colCount?: number
  rowCount?: number
  /** Short descriptive subtitle shown below the label */
  description?: string
  selected?: boolean
  hasInput?: boolean
  hasOutput?: boolean
  /** Extra source handle on the right (OUTPUT nodes that also feed downstream) */
  hasExtraSource?: boolean
  children?: ReactNode
}

export const DataObjectNode = memo(function DataObjectNode({
  variant, label, colCount, rowCount, description,
  selected = false,
  hasInput = true,
  hasOutput = true,
  hasExtraSource = false,
  children,
}: DataObjectNodeProps) {
  return (
    <div className={clsx('data-object-node', `variant-${variant}`, selected && 'node-selected')}>
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="do-handle-target"
        />
      )}

      {/* Header */}
      <div className="do-header">
        <span className="do-badge">{BADGE_TEXT[variant]}</span>
        <span className="do-label">{label}</span>
      </div>

      {/* Body */}
      <div className="do-body">
        {(colCount !== undefined || rowCount !== undefined) && (
          <div className="do-meta">
            {colCount !== undefined && <span>{colCount} col{colCount !== 1 ? 's' : ''}</span>}
            {colCount !== undefined && rowCount !== undefined && <span className="do-meta-sep">·</span>}
            {rowCount !== undefined && <span>{rowCount.toLocaleString()} rows</span>}
          </div>
        )}
        {description && (
          <span className="text-[0.5625rem] italic opacity-70 truncate">{description}</span>
        )}
        {children}
      </div>

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="do-handle-source"
        />
      )}
      {hasExtraSource && !hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="do-handle-source"
        />
      )}
    </div>
  )
})
