import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { TransformNode as TNode, TransformConfig } from '../../../types'

export const TransformNode = memo(({ data, selected }: NodeProps) => {
  const node = data as TNode
  const cfg = node.config as TransformConfig | null
  const enabledCount = cfg?.columns.filter(c => c.enabled).length ?? 0
  const hasExpr = cfg?.columns.some(c => c.expression) ?? false

  return (
    <BaseNode
      label={node.label}
      icon="⚡"
      colorClass="bg-[#1e2b1e]"
      borderColorClass="border-[#2e4a2e]"
      selected={selected}
      status={node.status ?? 'idle'}
      columnCount={enabledCount || undefined}
    >
      {cfg && cfg.columns.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {cfg.columns.slice(0, 3).filter(c => c.enabled).map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className="text-[#4ec9b0] font-mono truncate max-w-[70px]">{c.source || '—'}</span>
              {(c.outputName && c.outputName !== c.source) && (
                <>
                  <span className="text-[#6a6a6a]">→</span>
                  <span className="text-[#dcdcaa] font-mono truncate max-w-[70px]">{c.outputName}</span>
                </>
              )}
              {c.castType && <span className="text-[#c586c0] text-[9px]">::{c.castType}</span>}
              {c.expression && <span className="text-[#c586c0] text-[9px] italic">fx</span>}
            </div>
          ))}
          {cfg.columns.length > 3 && (
            <span className="text-[10px] text-[#6a6a6a]">+{cfg.columns.length - 3} more</span>
          )}
          {hasExpr && (
            <span className="text-[9px] text-[#c586c0] mt-0.5">Has expressions</span>
          )}
        </div>
      ) : (
        <span className="text-[#6a6a6a] italic">Not configured</span>
      )}
    </BaseNode>
  )
})

TransformNode.displayName = 'TransformNode'
