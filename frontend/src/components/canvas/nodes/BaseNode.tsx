import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface BaseNodeProps {
  label: string
  icon: ReactNode
  colorClass: string
  borderColorClass: string
  children?: ReactNode
  hasInput?: boolean | 'dual'   // false | true | 'dual' (join: two input handles)
  hasOutput?: boolean
  selected?: boolean
  status?: 'idle' | 'running' | 'success' | 'error'
  columnCount?: number
}

const statusDot: Record<string, string> = {
  idle: 'bg-[#6a6a6a]',
  running: 'bg-[#dcdcaa] animate-pulse',
  success: 'bg-[#4ec9b0]',
  error: 'bg-[#f44747]',
}

export function BaseNode({
  label, icon, colorClass, borderColorClass,
  children, hasInput = true, hasOutput = true,
  selected = false, status = 'idle', columnCount,
}: BaseNodeProps) {
  return (
    <div
      className={clsx(
        'rounded-md border min-w-[170px] max-w-[230px] text-xs shadow-lg',
        colorClass,
        selected ? 'border-[#0e639c] ring-1 ring-[#4fc1ff]/40' : borderColorClass,
      )}
    >
      {/* Single input handle */}
      {hasInput === true && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-[#3c3c3c] !border-[#6a6a6a] hover:!bg-[#0e639c] !rounded-full"
        />
      )}

      {/* Dual input handles (for Join: left=A top, right=B bottom) */}
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
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        <span className="text-sm leading-none">{icon}</span>
        <span className="font-medium text-[#cccccc] truncate flex-1 text-[12px]">{label}</span>
        {columnCount !== undefined && (
          <span className="text-[9px] text-[#6a6a6a] bg-black/20 px-1 rounded">
            {columnCount} col
          </span>
        )}
        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0 ml-0.5', statusDot[status])} />
      </div>

      {/* Body */}
      {children && (
        <div className="px-2.5 py-1.5 text-[11px] text-[#969696]">
          {children}
        </div>
      )}

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[#3c3c3c] !border-[#6a6a6a] hover:!bg-[#4ec9b0] !rounded-full"
        />
      )}
    </div>
  )
}
