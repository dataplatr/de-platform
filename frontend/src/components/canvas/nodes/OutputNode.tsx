import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import { memo, useEffect, useState } from 'react'
import { useTransformationStore } from '../../../store/transformationStore'
import { api } from '../../../services/api'
import type { TransformNode } from '../../../types'

interface OutputNodeProps {
  data: TransformNode
  selected?: boolean
}

export const OutputNode = memo(function OutputNode({ data, selected }: OutputNodeProps) {
  const { updateNode, nodes, edges, setGeneratedSQL } = useTransformationStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const config = data.config as { targetTable?: string } | null
  const tableName = config?.targetTable || data.label

  // Count how many edges come in (many-to-many: multiple inputs possible)
  const inputEdges = edges.filter(e => e.target === data.id)
  const inputCount = inputEdges.length

  // Compile SQL from all upstream paths and expose it when this node is selected
  useEffect(() => {
    if (inputCount === 0) return
    api.compilePipeline(nodes, edges, data.id)
      .then(({ data: res }) => setGeneratedSQL(res.sql))
      .catch(() => { /* ignore compile errors — node may not be fully connected yet */ })
  }, [data.id, nodes, edges, inputCount, setGeneratedSQL])

  const startEdit = () => {
    setDraft(tableName)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim() || tableName
    updateNode(data.id, {
      label: trimmed,
      config: { ...(config ?? {}), targetTable: trimmed },
    })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div
      className={clsx(
        'node-base node-output',
        selected && 'node-selected',
      )}
    >
      {/* Target handle — accepts connections (many-to-many: multiple outputs can connect) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-[#1e4a3b] !border-[#4ec9b0] hover:!bg-[#0e639c] !rounded-full"
      />

      {/* Source handle — output node CAN be a source for further transforms */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-[#1e4a3b] !border-[#4ec9b0] hover:!bg-[#0e639c] !rounded-full"
      />

      {/* Header */}
      <div className="node-header">
        <span className="text-sm leading-none">🎯</span>
        <span className="text-[10px] font-semibold text-[#4ec9b0] uppercase tracking-widest flex-1">
          Output
        </span>
        {inputCount > 1 && (
          <span className="text-[9px] bg-[#0e3a2b] text-[#4ec9b0] px-1 rounded border border-[#4ec9b0]/30">
            {inputCount} in
          </span>
        )}
        <div className="w-1.5 h-1.5 rounded-full bg-[#4ec9b0] shrink-0 ml-0.5" />
      </div>

      {/* Table name — editable */}
      <div className="node-body">
        {editing ? (
          <input
            autoFocus
            aria-label="Output table name"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="w-full bg-[#1e3a2b] border border-[#4ec9b0]/40 rounded px-1.5 py-0.5 text-[#cccccc] text-xs outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={startEdit}
            title="Double-click to rename"
            className="w-full text-left font-semibold text-[#cccccc] truncate hover:text-[#4ec9b0] transition-colors"
          >
            {tableName}
          </button>
        )}
        <p className="text-[10px] text-[#4a6a5a] mt-0.5">double-click to rename</p>
      </div>
    </div>
  )
})
