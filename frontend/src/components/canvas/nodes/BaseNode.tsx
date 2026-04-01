import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface BaseNodeProps {
  label: string
  icon: ReactNode
  nodeClass: string            // e.g. 'node-source', 'node-filter', …
  children?: ReactNode
  hasInput?: boolean | 'dual'
  hasOutput?: boolean
  selected?: boolean
  status?: 'idle' | 'running' | 'success' | 'error'
  columnCount?: number
  // allow source handle (output nodes can also emit)
  hasSource?: boolean
}

const statusDot: Record<string, string> = {
  idle:    'bg-[#6a6a6a]',
  running: 'bg-[#dcdcaa] animate-pulse',
  success: 'bg-[#4ec9b0]',
  error:   'bg-[#f44747]',
}

export const BaseNode = memo(function BaseNode({
  label, icon, nodeClass,
  children, hasInput = true, hasOutput = true, hasSource,
  selected = false, status = 'idle', columnCount,
}: BaseNodeProps) {
  return (
    <div className={clsx('node-base', nodeClass, selected && 'node-selected')}>
      {/* Single input handle */}
      {hasInput === true && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-[#3c3c3c] !border-[#6a6a6a] hover:!bg-[#0e639c] !rounded-full"
        />
      )}

      {/* Dual input handles (Join: A = top, B = bottom) */}
      {hasInput === 'dual' && (
        <>
          <Handle
            id="a"
            type="target"
            position={Position.Left}
            style={{ top: '33%' }}
            className="!w-2.5 !h-2.5 !bg-[#1e4a3b] !border-[#4ec9b0] hover:!bg-[#0e639c] !rounded-full"
          />
          <Handle
            id="b"
            type="target"
            position={Position.Left}
            style={{ top: '67%' }}
            className="!w-2.5 !h-2.5 !bg-[#3a2b1e] !border-[#dcdcaa] hover:!bg-[#0e639c] !rounded-full"
          />
        </>
      )}

      {/* Header */}
      <div className="node-header">
        <span className="text-sm leading-none">{icon}</span>
        <span className="node-header-label">{label}</span>
        {columnCount !== undefined && (
          <span className="node-col-count">{columnCount} col</span>
        )}
        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0 ml-0.5', statusDot[status])} />
      </div>

      {/* Body */}
      {children && (
        <div className="node-body">
          {children}
        </div>
      )}

      {/* Output source handle — right side */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[#3c3c3c] !border-[#6a6a6a] hover:!bg-[#4ec9b0] !rounded-full"
        />
      )}

      {/* Extra source handle — for output nodes that also feed downstream */}
      {hasSource && !hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[#1e4a3b] !border-[#4ec9b0] hover:!bg-[#0e639c] !rounded-full"
        />
      )}
    </div>
  )
})
