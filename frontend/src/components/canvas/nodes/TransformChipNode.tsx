/**
 * TransformChipNode — transformation step as a proper node card.
 *
 * Visual: colored left-accent border (PRD §9.4 color palette), solid dark
 * background, Lucide icon + type label + node name + config summary.
 *
 * Interactions:
 *   - Single click → selects node + opens config panel (handled by onNodeClick)
 *   - Double-click label → inline rename
 */
import { memo, useState, useRef, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import { Filter, Merge, BarChart3, Columns2, Wand2, ScanLine, type LucideIcon } from 'lucide-react'
import { useTransformationStore } from '../../../store/transformationStore'

// ── Icon + label registry ──────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  filter: Filter,
  join: Merge,
  aggregate: BarChart3,
  select: Columns2,
  transform: Wand2,
  deduplicate: ScanLine,
}

const TYPE_LABEL: Record<string, string> = {
  filter: 'FILTER',
  join: 'JOIN',
  aggregate: 'AGGREGATE',
  select: 'SELECT',
  transform: 'TRANSFORM',
  deduplicate: 'DEDUPLICATE',
}

// ── Component ──────────────────────────────────────────────────────────────

interface TransformChipNodeProps {
  nodeId: string
  nodeType: string
  label: string
  summary: string
  selected?: boolean
  inputMode?: 'single' | 'dual'
}

export const TransformChipNode = memo(function TransformChipNode({
  nodeId,
  nodeType,
  label,
  summary,
  selected = false,
  inputMode = 'single',
}: TransformChipNodeProps) {
  const { updateNode } = useTransformationStore()
  const Icon = ICONS[nodeType]

  // ── Inline rename ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setEditVal(label)
      setEditing(true)
      setTimeout(() => {
        inputRef.current?.select()
      }, 0)
    },
    [label]
  )

  const commitEdit = useCallback(() => {
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== label) updateNode(nodeId, { label: trimmed })
    setEditing(false)
  }, [editVal, label, nodeId, updateNode])

  // Keep editVal in sync if label changed externally while not editing
  if (!editing && editVal !== label) setEditVal(label)

  // Truncate long summaries; hide placeholder summaries
  const showSummary = summary && summary !== 'Not configured' && summary !== 'No conditions'
  const shortSummary = showSummary
    ? summary.length > 26
      ? summary.slice(0, 24) + '…'
      : summary
    : null

  return (
    <div className={clsx('tcn-wrap', `tcn-${nodeType}`, selected && 'node-selected')}>
      {/* ── Input handles ── */}
      {inputMode === 'single' ? (
        <Handle type="target" position={Position.Left} className="tcn-handle" />
      ) : (
        <>
          <Handle
            id="a"
            type="target"
            position={Position.Left}
            style={{ top: '33%' }}
            className="tcn-handle"
          />
          <Handle
            id="b"
            type="target"
            position={Position.Left}
            style={{ top: '67%' }}
            className="tcn-handle tcn-handle-secondary"
          />
        </>
      )}

      {/* ── Type badge row ── */}
      <div className="tcn-type-row">
        {Icon && <Icon size={10} className="tcn-type-icon shrink-0" />}
        <span className="tcn-type-label">{TYPE_LABEL[nodeType] ?? nodeType.toUpperCase()}</span>
      </div>

      {/* ── Node name (double-click to rename) ── */}
      <div className="tcn-name-row" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            autoFocus
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              }
              if (e.key === 'Escape') {
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="tcn-rename-input"
            aria-label="Rename node"
          />
        ) : (
          <span className="tcn-name" title="Double-click to rename">
            {label}
          </span>
        )}
      </div>

      {/* ── Config summary ── */}
      {shortSummary && (
        <div className="tcn-summary-row">
          <span className="tcn-summary">{shortSummary}</span>
        </div>
      )}

      {/* ── Source handle ── */}
      <Handle type="source" position={Position.Right} className="tcn-handle tcn-handle-source" />
    </div>
  )
})

TransformChipNode.displayName = 'TransformChipNode'
