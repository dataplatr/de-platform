import { useCallback, useMemo, useState } from 'react'
import { Play, Info, Workflow, ChevronDown, ChevronRight } from 'lucide-react'
import type { TransformNode as TNode, TransformEdge as TEdge } from '../../types'
import { useTransformationStore } from '../../store/transformationStore'
import { FilterConfig } from './FilterConfig'
import { JoinConfig } from './JoinConfig'
import { AggregateConfig } from './AggregateConfig'
import { SelectConfig } from './SelectConfig'
import { TransformConfig } from './TransformConfig'
import { DeduplicateConfig } from './DeduplicateConfig'
import { getAllUpstream } from '../../utils/graphUtils'
import type {
  FilterCondition,
  JoinConfig as JoinCfg,
  AggregationConfig,
  SelectConfig as SelectCfg,
  TransformConfig as TransformCfg,
  DeduplicateConfig as DedupCfg,
} from '../../types'
import { useNodePreview } from '../../hooks/useNodePreview'
import { useUpstreamColumns } from '../../hooks/useUpstreamColumns'
import { NODE_META } from '../../constants/nodeMetadata'

function PipelineTree({ chain }: { chain: TNode[] }) {
  return (
    <div className="flex flex-col">
      {chain.map((n, i) => {
        const meta = NODE_META[n.type] ?? NODE_META.source
        const isSource = n.type === 'source'
        const isLast = i === chain.length - 1
        return (
          <div key={n.id} className="flex items-stretch">
            <div className="flex flex-col items-center w-5 shrink-0 mr-2">
              <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${isSource ? 'bg-[var(--step-join)]' : 'bg-[var(--border)]'}`} />
              {!isLast && <div className="w-px flex-1 bg-[var(--border)] my-0.5" />}
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 py-1.5 border-b border-theme last:border-b-0">
              <span className="text-sm leading-none shrink-0">{meta.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className={`text-[9px] font-bold uppercase tracking-wide ${meta.labelClass}`}>{n.type}</span>
                <span className="text-[11px] text-primary truncate leading-tight">{n.label}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OutputConfig({ nodeId, nodes, edges }: { nodeId: string; nodes: TNode[]; edges: TEdge[] }) {
  const { updateNode, expandedOutputId, setExpandedOutputId } = useTransformationStore()
  const [showTree, setShowTree] = useState(false)
  const node = nodes.find(n => n.id === nodeId)
  const cfg = node?.config as { targetTable?: string } | null

  const isCanvasExpanded = expandedOutputId === nodeId
  const toggleCanvas = useCallback(
    () => setExpandedOutputId(isCanvasExpanded ? null : nodeId),
    [isCanvasExpanded, nodeId, setExpandedOutputId],
  )

  const allUpstream = useMemo(() => getAllUpstream(nodeId, nodes, edges), [nodeId, nodes, edges])
  const sourceNodes = useMemo(() => allUpstream.filter(n => n.type === 'source'), [allUpstream])
  const transformSteps = useMemo(() => allUpstream.filter(n => n.type !== 'source'), [allUpstream])

  const commitName = useCallback((trimmed: string) => {
    const val = trimmed.trim() || 'output'
    updateNode(nodeId, { label: val, config: { ...(cfg ?? {}), targetTable: val } })
  }, [nodeId, cfg, updateNode])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-secondary uppercase tracking-wider">Target Table</span>
        <input
          aria-label="Target table name"
          defaultValue={cfg?.targetTable || node?.label || 'output'}
          onBlur={e => commitName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitName((e.target as HTMLInputElement).value) }}
          className="bg-elevated border border-theme rounded px-2 py-1 text-xs font-mono text-[var(--accent-fg)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      {allUpstream.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-elevated border border-theme rounded-md p-2 text-center">
            <div className="text-base font-bold text-[var(--accent-fg)]">{sourceNodes.length}</div>
            <div className="text-[9px] text-muted uppercase tracking-wider mt-0.5">
              Source{sourceNodes.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="bg-elevated border border-theme rounded-md p-2 text-center">
            <div className="text-base font-bold text-[var(--accent-fg)]">{transformSteps.length}</div>
            <div className="text-[9px] text-muted uppercase tracking-wider mt-0.5">
              Transform{transformSteps.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {allUpstream.length > 0 && (
        <button
          type="button"
          onClick={toggleCanvas}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md border text-xs font-semibold transition-all ${
            isCanvasExpanded
              ? 'bg-[var(--node-output-bg)] border-[var(--node-output-border)] text-[var(--success)]'
              : 'bg-elevated border-theme text-secondary hover:border-[var(--accent)] hover:text-primary'
          }`}
        >
          <Workflow size={13} className="shrink-0" />
          <span className="flex-1 text-left">
            {isCanvasExpanded ? 'Collapse Canvas View' : 'Expand Full Pipeline in Canvas'}
          </span>
          <span className="text-[10px] opacity-60">⤢</span>
        </button>
      )}

      {allUpstream.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowTree(v => !v)}
            className="flex items-center justify-between px-2 py-1.5 bg-elevated border border-theme rounded-md text-[10px] font-semibold text-secondary uppercase tracking-wider w-full hover:text-primary transition-colors"
          >
            <span>Pipeline steps ({allUpstream.length})</span>
            {showTree ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          {showTree && (
            <div className="border border-theme rounded-md overflow-hidden">
              <PipelineTree chain={allUpstream} />
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--node-output-bg)] border-t border-theme">
                <span className="text-sm">🎯</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wide step-label-output">output</span>
                  <span className="text-[11px] text-primary truncate">{cfg?.targetTable || node?.label}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {allUpstream.length === 0 && (
        <p className="text-xs text-muted italic">No inputs connected yet.</p>
      )}
    </div>
  )
}

export function NodeConfigPanel() {
  const { selectedNodeId, nodes, edges } = useTransformationStore()
  const node = nodes.find(n => n.id === selectedNodeId)

  const { runPreview } = useNodePreview()
  const { upstreamCols, leftCols, rightCols } = useUpstreamColumns(node)

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted p-4">
        <Info size={20} className="opacity-40" />
        <p className="text-xs text-center">Select a node on the canvas to configure it.</p>
      </div>
    )
  }

  const meta = NODE_META[node.type]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Node header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme bg-surface shrink-0">
        <span>{meta?.icon ?? '🎯'}</span>
        <span className={`text-xs font-semibold ${meta?.colorClass ?? 'text-[var(--success)]'}`}>{node.label}</span>
        <span className="text-[10px] text-muted ml-1 uppercase">{node.type}</span>
        <button
          type="button"
          onClick={runPreview}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
          title="Run preview for this node"
        >
          <Play size={11} /> Preview
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {node.type === 'source' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-secondary uppercase tracking-wider">Table</span>
              <code className="text-[var(--accent-fg)] text-xs bg-elevated border border-theme rounded px-2 py-1">
                {node.tableRef ?? '(none)'}
              </code>
            </div>
            {node.columns && node.columns.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-secondary uppercase tracking-wider">Schema ({node.columns.length} cols)</span>
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto scrollbar-thin">
                  {node.columns.map(col => (
                    <div key={col.name} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                      <span className="step-label-select font-mono">{col.name}</span>
                      <span className="text-muted text-[10px] ml-auto">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {node.type === 'filter' && (
          <FilterConfig
            nodeId={node.id}
            config={(node.config as FilterCondition[]) ?? []}
            columns={upstreamCols}
          />
        )}

        {node.type === 'join' && (
          <JoinConfig
            nodeId={node.id}
            config={(node.config as JoinCfg) ?? { joinType: 'INNER', conditions: [], rightTable: '' }}
            leftColumns={leftCols}
            rightColumns={rightCols}
          />
        )}

        {node.type === 'aggregate' && (
          <AggregateConfig
            nodeId={node.id}
            config={(node.config as AggregationConfig) ?? { groupBy: [], measures: [] }}
            columns={upstreamCols}
          />
        )}

        {node.type === 'select' && (
          <SelectConfig
            nodeId={node.id}
            config={(node.config as SelectCfg) ?? { columns: [] }}
            columns={upstreamCols}
          />
        )}

        {node.type === 'transform' && (
          <TransformConfig
            nodeId={node.id}
            config={(node.config as TransformCfg) ?? { columns: [] }}
            columns={upstreamCols}
          />
        )}

        {node.type === 'deduplicate' && (
          <DeduplicateConfig
            nodeId={node.id}
            config={(node.config as DedupCfg) ?? { partitionBy: [], orderBy: '', orderDir: 'DESC' }}
            columns={upstreamCols}
          />
        )}

        {node.type === 'output' && (
          <OutputConfig nodeId={node.id} nodes={nodes} edges={edges} />
        )}
      </div>
    </div>
  )
}
