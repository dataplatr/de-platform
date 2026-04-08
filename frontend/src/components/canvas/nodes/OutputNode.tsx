import { memo, useEffect, useState } from 'react'
import { useTransformationStore } from '../../../store/transformationStore'
import { api } from '../../../services/api'
import type { TransformNode, OutputConfig } from '../../../types'
import { DataObjectNode } from './DataObjectNode'

interface OutputNodeProps {
  data: TransformNode
  selected?: boolean
}

export const OutputNode = memo(function OutputNode({ data, selected }: OutputNodeProps) {
  const { updateNode, nodes, edges, setGeneratedSQL } = useTransformationStore()

  const config = (data.config ?? {}) as Partial<OutputConfig>
  const tableName = config.targetTable || data.label
  const targetCatalog = config.targetCatalog || ''
  const targetSchema = config.targetSchema || ''

  const inputEdges = edges.filter((e) => e.target === data.id)

  // Compile SQL whenever graph changes
  useEffect(() => {
    if (inputEdges.length === 0) return
    api
      .compilePipeline(nodes, edges, data.id)
      .then(({ data: res }) => setGeneratedSQL(res.sql))
      .catch(() => {
        /* ignore compile errors */
      })
  }, [data.id, nodes, edges, inputEdges.length, setGeneratedSQL])

  // ── Inline table-name editing ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(tableName)
    setEditing(true)
  }
  const commit = () => {
    const trimmed = draft.trim() || tableName
    updateNode(data.id, {
      label: trimmed,
      config: { ...config, targetTable: trimmed },
    })
    setEditing(false)
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  // ── Target location fields (catalog + schema) ──────────────────────────────
  const updateCatalog = (v: string) =>
    updateNode(data.id, { config: { ...config, targetCatalog: v.trim() } })

  const updateSchema = (v: string) =>
    updateNode(data.id, { config: { ...config, targetSchema: v.trim() } })

  const displayRef =
    targetCatalog && targetSchema ? `${targetCatalog}.${targetSchema}.${tableName}` : undefined

  return (
    <DataObjectNode
      variant="output"
      label={tableName}
      description={displayRef}
      selected={selected}
      hasInput
      hasOutput
    >
      {/* Table name */}
      {editing ? (
        <input
          autoFocus
          aria-label="Output table name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-full bg-[var(--node-output-bg)] border border-[var(--node-output-border)] rounded px-1.5 py-0.5 text-[var(--text-1)] text-[0.625rem] outline-none mt-0.5"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={startEdit}
          title="Double-click to rename"
          className="w-full text-left text-[0.5625rem] text-[var(--text-3)] italic hover:text-[var(--success)] transition-colors"
        >
          double-click to rename
        </button>
      )}

      {/* Catalog */}
      <input
        type="text"
        value={targetCatalog}
        onChange={(e) => updateCatalog(e.target.value)}
        placeholder="catalog"
        title="Target catalog"
        className="w-full mt-0.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-1)] text-[0.5625rem] outline-none focus:border-[var(--success)]/50 placeholder-[var(--text-3)]"
      />

      {/* Schema */}
      <input
        type="text"
        value={targetSchema}
        onChange={(e) => updateSchema(e.target.value)}
        placeholder="schema"
        title="Target schema"
        className="w-full mt-0.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-1)] text-[0.5625rem] outline-none focus:border-[var(--success)]/50 placeholder-[var(--text-3)]"
      />
    </DataObjectNode>
  )
})
