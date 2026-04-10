import { useCallback } from 'react'
import { useTransformationStore } from '../../store/transformationStore'
import type { DeduplicateConfig as Cfg, Column } from '../../types'
import { MultiSelectDropdown } from '../common/MultiSelectDropdown'

interface Props {
  nodeId: string
  config: Cfg
  columns: Column[]
}

export function DeduplicateConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback(
    (patch: Partial<Cfg>) => {
      updateNode(nodeId, { config: { ...config, ...patch } as Cfg })
    },
    [nodeId, config, updateNode]
  )

  const names = columns.map((c) => c.name)

  return (
    <div className="flex flex-col gap-4">
      {columns.length === 0 && (
        <p className="text-[11px] text-muted italic">Connect a source node first.</p>
      )}

      {/* Partition by */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-secondary uppercase tracking-wider">
          Deduplicate on <span className="text-muted normal-case">(unique key columns)</span>
        </span>
        <MultiSelectDropdown
          options={names}
          selected={config.partitionBy}
          onChange={(v) => set({ partitionBy: v })}
          placeholder="Select key columns…"
          accent="text-[var(--success)]"
        />
        <p className="text-[10px] text-muted">
          Rows with the same values in these columns are duplicates. Leave empty to DISTINCT the
          entire row.
        </p>
      </div>

      {/* Order by */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-secondary uppercase tracking-wider">
          Keep <span className="text-muted normal-case">(order by)</span>
        </span>

        <div className="flex flex-col gap-1">
          <select
            value={config.orderBy}
            onChange={(e) => set({ orderBy: e.target.value })}
            aria-label="Order by column"
            className="w-full min-w-0 bg-elevated border border-theme text-[var(--step-select)] text-xs rounded px-2 py-1 outline-none"
          >
            <option value="">— no ordering —</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select
            value={config.orderDir}
            onChange={(e) => set({ orderDir: e.target.value as Cfg['orderDir'] })}
            disabled={!config.orderBy}
            aria-label="Order direction"
            className="w-full min-w-0 bg-elevated border border-theme text-secondary text-xs rounded px-2 py-1 outline-none disabled:opacity-40"
          >
            <option value="DESC">DESC — keep latest / highest</option>
            <option value="ASC">ASC — keep earliest / lowest</option>
          </select>
        </div>

        <p className="text-[10px] text-muted">
          {config.orderBy
            ? `Keeps the row with the ${config.orderDir === 'DESC' ? 'highest' : 'lowest'} ${config.orderBy}.`
            : 'No order column — keeps an arbitrary duplicate.'}
        </p>
      </div>
    </div>
  )
}
