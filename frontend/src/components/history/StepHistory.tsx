import { useTransformationStore } from '../../store/transformationStore'
import type { TransformNode, TransformEdge } from '../../types'
import clsx from 'clsx'

const NODE_META: Record<string, { icon: string; color: string; label: string }> = {
  source:    { icon: '🗃️', color: 'text-[#4fc1ff]',  label: 'Source'    },
  filter:    { icon: '🔽', color: 'text-[#dcdcaa]',  label: 'Filter'    },
  join:      { icon: '🔗', color: 'text-[#4ec9b0]',  label: 'Join'      },
  aggregate: { icon: '∑',  color: 'text-[#c586c0]',  label: 'Aggregate' },
  select:    { icon: '📋', color: 'text-[#9cdcfe]',  label: 'Select'    },
}

/**
 * Returns nodes in topological order (sources first, sinks last).
 * Simple Kahn's algorithm.
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

  // append any remaining (cycle guard)
  nodes.forEach((n) => { if (!result.includes(n)) result.push(n) })
  return result
}

/** Count how many edges enter / leave a node */
function getEdgeCounts(nodeId: string, edges: TransformEdge[]) {
  return {
    inputs:  edges.filter((e) => e.target === nodeId).length,
    outputs: edges.filter((e) => e.source === nodeId).length,
  }
}

function configSummary(node: TransformNode): string {
  if (node.type === 'source') return node.tableRef ?? node.label
  if (node.type === 'filter') {
    const conditions = (node.config as import('../../types').FilterCondition[] | null) ?? []
    return conditions.length ? `${conditions.length} condition${conditions.length > 1 ? 's' : ''}` : 'No conditions'
  }
  if (node.type === 'join') {
    const cfg = node.config as import('../../types').JoinConfig | null
    return cfg ? `${cfg.joinType} JOIN — ${cfg.conditions.length} key${cfg.conditions.length !== 1 ? 's' : ''}` : 'Not configured'
  }
  if (node.type === 'aggregate') {
    const cfg = node.config as import('../../types').AggregationConfig | null
    if (!cfg) return 'Not configured'
    return `GROUP BY ${cfg.groupBy.length}, ${cfg.measures.length} measure${cfg.measures.length !== 1 ? 's' : ''}`
  }
  if (node.type === 'select') {
    const cfg = node.config as import('../../types').SelectConfig | null
    return cfg ? `${cfg.columns.length} column${cfg.columns.length !== 1 ? 's' : ''}` : 'Not configured'
  }
  return ''
}

export function StepHistory() {
  const { nodes, edges, selectedNodeId, setSelectedNode, removeNode } = useTransformationStore()

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6a6a6a] p-6 text-center">
        <span className="text-2xl opacity-40">⬡</span>
        <p className="text-xs">Pipeline is empty.</p>
        <p className="text-[11px] text-[#4a4a4a]">Drag a table onto the canvas to add the first step.</p>
      </div>
    )
  }

  const ordered = topoSort(nodes, edges)

  return (
    <div className="flex flex-col">
      {/* Step count header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2d2d30]">
        <span className="text-[10px] text-[#6a6a6a] uppercase tracking-wider">
          {ordered.length} step{ordered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-[#6a6a6a]">{edges.length} connection{edges.length !== 1 ? 's' : ''}</span>
      </div>

      {ordered.map((node, idx) => {
        const meta  = NODE_META[node.type] ?? { icon: '●', color: 'text-[#6a6a6a]', label: node.type }
        const { inputs, outputs } = getEdgeCounts(node.id, edges)
        const isSelected = selectedNodeId === node.id
        const summary = configSummary(node)

        return (
          <div
            key={node.id}
            onClick={() => setSelectedNode(node.id)}
            className={clsx(
              'group flex items-start gap-2.5 px-3 py-2.5 cursor-pointer border-b border-[#2d2d30] hover:bg-[#2d2d30] transition-colors select-none',
              isSelected && 'bg-[#1e3a5f] hover:bg-[#1e3a5f]'
            )}
          >
            {/* Step index + connector line */}
            <div className="flex flex-col items-center shrink-0 min-w-[24px]">
              <div className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border',
                isSelected ? 'border-[#4fc1ff] bg-[#1e3a5f] text-[#4fc1ff]' : 'border-[#3c3c3c] bg-[#2d2d30] text-[#6a6a6a]'
              )}>
                {idx + 1}
              </div>
              {idx < ordered.length - 1 && (
                <div className="w-px flex-1 bg-[#3c3c3c] mt-1 min-h-[12px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{meta.icon}</span>
                <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', meta.color)}>
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-[#cccccc] mt-0.5 truncate font-medium">{node.label}</p>
              {summary && (
                <p className="text-[11px] text-[#6a6a6a] mt-0.5 truncate">{summary}</p>
              )}
              {/* Edge counts */}
              <div className="flex items-center gap-2 mt-1">
                {inputs > 0 && (
                  <span className="text-[9px] text-[#6a6a6a]">↓ {inputs} in</span>
                )}
                {outputs > 0 && (
                  <span className="text-[9px] text-[#6a6a6a]">→ {outputs} out</span>
                )}
                {node.status && node.status !== 'idle' && (
                  <span className={clsx('text-[9px] uppercase font-semibold ml-auto', {
                    'text-[#dcdcaa]': node.status === 'running',
                    'text-[#4ec9b0]': node.status === 'success',
                    'text-[#f44747]': node.status === 'error',
                  })}>
                    {node.status}
                  </span>
                )}
              </div>
            </div>

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
              className="opacity-0 group-hover:opacity-100 icon-button shrink-0 text-[#6a6a6a] hover:text-[#f44747]"
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
