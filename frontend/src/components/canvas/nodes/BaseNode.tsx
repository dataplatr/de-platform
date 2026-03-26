import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface BaseNodeProps {
  label: string
  icon: ReactNode
  colorClass: string
  borderColorClass: string
  children?: ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  selected?: boolean
  status?: 'idle' | 'running' | 'success' | 'error'
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
  selected = false, status = 'idle',
}: BaseNodeProps) {
  return (
    <div
      className={clsx(
        'rounded-md border min-w-[160px] max-w-[220px] text-xs shadow-lg',
        colorClass,
        selected ? 'border-[#0e639c] ring-1 ring-[#0e639c]' : borderColorClass,
      )}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-[#4a4a4a] !border-[#6a6a6a] hover:!bg-[#0e639c]"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        <span className="text-sm">{icon}</span>
        <span className="font-medium text-[#cccccc] truncate flex-1">{label}</span>
        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', statusDot[status])} />
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
          className="!w-2 !h-2 !bg-[#4a4a4a] !border-[#6a6a6a] hover:!bg-[#0e639c]"
        />
      )}
    </div>
  )
}
