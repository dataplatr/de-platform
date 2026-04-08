import { useMemo } from 'react'
import { useTransformationStore } from '../../store/transformationStore'
import type { TransformNode, TransformEdge } from '../../types'
import { NODE_META } from '../../constants/nodeMetadata'
import clsx from 'clsx'

/**
 * Returns nodes in topological order (sources first, sinks last).
 * Kahn's algorithm — O(V + E).
 */
function topoSort(nodes: TransformNode[], edges: TransformEdge[]): TransformNode[] {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))

  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  })

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
  const result: TransformNode[] = []

  while (queue.length) {
    const node = queue.shift()!
    result.push(node)
    adj.get(node.id)?.forEach((targetId) => {
      const deg = (inDegree.get(targetId) ?? 1) - 1
      inDegree.set(targetId, deg)
      if (deg === 0) {
        const target = nodes.find((n) => n.id === targetId)
        if (target) queue.push(target)
      }
    })
  }

  // append any remaining nodes (cycle guard)
  nodes.forEach((n) => {
    if (!result.includes(n)) result.push(n)
  })
  return result
}

function getEdgeCounts(nodeId: string, edges: TransformEdge[]) {
  return {
    inputs: edges.filter((e) => e.target === nodeId).length,
    outputs: edges.filter((e) => e.source === nodeId).length,
  }
}

function configSummary(node: TransformNode): string {
  if (node.type === 'source') return node.tableRef ?? node.label
  if (node.type === 'filter') {
    const conditions = (node.config as import('../../types').FilterCondition[] | null) ?? []
    return conditions.length
      ? `${conditions.length} condition${conditions.length > 1 ? 's' : ''}`
      : 'No conditions'
  }
  if (node.type === 'join') {
    const cfg = node.config as import('../../types').JoinConfig | null
    return cfg
      ? `${cfg.joinType} JOIN — ${cfg.conditions.length} key${cfg.conditions.length !== 1 ? 's' : ''}`
      : 'Not configured'
  }
  if (node.type === 'aggregate') {
    const cfg = node.config as import('../../types').AggregationConfig | null
    if (!cfg) return 'Not configured'
    return `GROUP BY ${cfg.groupBy.length}, ${cfg.measures.length} measure${cfg.measures.length !== 1 ? 's' : ''}`
  }
  if (node.type === 'select') {
    const cfg = node.config as import('../../types').SelectConfig | null
    return cfg
      ? `${cfg.columns.length} column${cfg.columns.length !== 1 ? 's' : ''}`
      : 'Not configured'
  }
  return ''
}

export function StepHistory() {
  const { nodes, edges, selectedNodeId, setSelectedNode, removeNode } = useTransformationStore()

  // Memoize the topological sort — only recalculates when nodes/edges change
  const ordered = useMemo(() => topoSort(nodes, edges), [nodes, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted p-6 text-center">
        <span className="text-2xl opacity-40">⬡</span>
        <p className="text-xs">Pipeline is empty.</p>
        <p className="text-[11px] text-muted">
          Drag a table onto the canvas to add the first step.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-theme">
        <span className="text-[10px] text-muted uppercase tracking-wider">
          {ordered.length} step{ordered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-muted">
          {edges.length} connection{edges.length !== 1 ? 's' : ''}
        </span>
      </div>

      {ordered.map((node, idx) => {
        const meta = NODE_META[node.type] ?? {
          icon: '●',
          labelClass: 'text-muted',
          label: node.type,
        }
        const { inputs, outputs } = getEdgeCounts(node.id, edges)
        const isSelected = selectedNodeId === node.id
        const summary = configSummary(node)

        return (
          <div
            key={node.id}
            onClick={() => setSelectedNode(node.id)}
            className={clsx(
              'group flex items-start gap-2.5 px-3 py-2.5 cursor-pointer border-b border-theme hover:bg-elevated transition-colors select-none',
              isSelected && 'bg-[var(--selected-bg)] hover:bg-[var(--selected-bg)]'
            )}
          >
            <div className="flex flex-col items-center shrink-0 min-w-[24px]">
              <div
                className={clsx(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
                  isSelected ? 'step-circle--selected' : 'step-circle'
                )}
              >
                {idx + 1}
              </div>
              {idx < ordered.length - 1 && (
                <div className="step-connector w-px flex-1 mt-1 min-h-[12px]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{meta.icon}</span>
                <span
                  className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wide',
                    meta.labelClass
                  )}
                >
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-primary mt-0.5 truncate font-medium">{node.label}</p>
              {summary && <p className="text-[11px] text-muted mt-0.5 truncate">{summary}</p>}
              <div className="flex items-center gap-2 mt-1">
                {inputs > 0 && <span className="text-[9px] text-muted">↓ {inputs} in</span>}
                {outputs > 0 && <span className="text-[9px] text-muted">→ {outputs} out</span>}
                {node.status && node.status !== 'idle' && (
                  <span
                    className={clsx('text-[9px] uppercase font-semibold ml-auto', {
                      'text-warning': node.status === 'running',
                      'text-success': node.status === 'success',
                      'text-error': node.status === 'error',
                    })}
                  >
                    {node.status}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeNode(node.id)
              }}
              className="opacity-0 group-hover:opacity-100 icon-button shrink-0 text-muted hover:text-[var(--error)]"
              title="Remove step"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
