import { useEffect } from 'react'
import { Play, Info } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { FilterConfig } from './FilterConfig'
import { JoinConfig } from './JoinConfig'
import { AggregateConfig } from './AggregateConfig'
import { SelectConfig } from './SelectConfig'
import {
  getUpstreamColumns,
  getColumnsForHandle,
  generateNodeSQL,
} from '../../services/sqlGenerator'
import type { FilterCondition, JoinConfig as JoinCfg, AggregationConfig, SelectConfig as SelectCfg } from '../../types'
import { api } from '../../services/api'

const NODE_COLORS: Record<string, string> = {
  source:    'text-[#4fc1ff]',
  filter:    'text-[#dcdcaa]',
  join:      'text-[#4ec9b0]',
  aggregate: 'text-[#c39dff]',
  select:    'text-[#9cdcfe]',
}

const NODE_ICONS: Record<string, string> = {
  source: '🗃️', filter: '🔽', join: '🔗', aggregate: '∑', select: '📋',
}

export function NodeConfigPanel() {
  const {
    selectedNodeId, nodes, edges,
    setGeneratedSQL, setOutputPreview, setPreviewLoading, setBottomPanelTab,
  } = useTransformationStore()

  const node = nodes.find(n => n.id === selectedNodeId)

  // Regenerate SQL whenever the node config or graph changes
  useEffect(() => {
    if (!selectedNodeId) { setGeneratedSQL('-- Select a node to see its SQL'); return }
    const sql = generateNodeSQL(selectedNodeId, nodes, edges)
    setGeneratedSQL(sql)
  }, [selectedNodeId, nodes, edges, setGeneratedSQL])

  const runPreview = async () => {
    if (!selectedNodeId) return
    const sql = generateNodeSQL(selectedNodeId, nodes, edges)
    if (sql.startsWith('--')) return
    setPreviewLoading(true)
    setBottomPanelTab('output')
    try {
      const { data } = await api.preview(sql, 100)
      setOutputPreview({
        columns: (data.columns as string[]).map(name => ({ name, type: 'UNKNOWN' })),
        rows: (data.rows as unknown[][]).map(row =>
          Object.fromEntries((data.columns as string[]).map((col, i) => [col, row[i]]))
        ),
        totalRows: data.row_count,
        executionMs: data.execution_time_ms,
        sampled: data.is_sampled,
      })
    } catch {
      setOutputPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6a6a6a] p-4">
        <Info size={20} className="opacity-40" />
        <p className="text-xs text-center">Select a node on the canvas to configure it.</p>
      </div>
    )
  }

  const upstreamCols = getUpstreamColumns(node.id, nodes, edges)
  const leftCols = getColumnsForHandle(node.id, 'a', nodes, edges)
  const rightCols = getColumnsForHandle(node.id, 'b', nodes, edges)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Node header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
        <span>{NODE_ICONS[node.type]}</span>
        <span className={`text-xs font-semibold ${NODE_COLORS[node.type]}`}>{node.label}</span>
        <span className="text-[10px] text-[#6a6a6a] ml-1 uppercase">{node.type}</span>
        <button
          type="button"
          onClick={runPreview}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
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
              <span className="text-[10px] text-[#969696] uppercase tracking-wider">Table</span>
              <code className="text-[#4fc1ff] text-xs bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1">
                {node.tableRef ?? '(none)'}
              </code>
            </div>
            {node.columns && node.columns.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#969696] uppercase tracking-wider">Schema ({node.columns.length} cols)</span>
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto scrollbar-thin">
                  {node.columns.map(col => (
                    <div key={col.name} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                      <span className="text-[#9cdcfe] font-mono">{col.name}</span>
                      <span className="text-[#6a6a6a] text-[10px] ml-auto">{col.type}</span>
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
      </div>
    </div>
  )
}
