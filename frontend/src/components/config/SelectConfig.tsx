import { useCallback } from 'react'
import { useTransformationStore } from '../../store/transformationStore'
import type { SelectConfig as SelectCfg, Column } from '../../types'

interface Props { nodeId: string; config: SelectCfg; columns: Column[] }

export function SelectConfig({ nodeId, config, columns }: Props) {
  const { updateNode } = useTransformationStore()

  const set = useCallback((cols: SelectCfg['columns']) => {
    updateNode(nodeId, { config: { columns: cols } })
  }, [nodeId, updateNode])

  const isSelected = (name: string) => config.columns.some(c => c.source === name)

  const toggle = (name: string) => {
    if (isSelected(name)) {
      set(config.columns.filter(c => c.source !== name))
    } else {
      set([...config.columns, { source: name, alias: '' }])
    }
  }

  const setAlias = (name: string, alias: string) => {
    set(config.columns.map(c => c.source === name ? { ...c, alias } : c))
  }

  const selectAll = () => set(columns.map(c => ({ source: c.name, alias: '' })))
  const clearAll = () => set([])

  return (
    <div className="flex flex-col gap-3">
      {columns.length === 0 && (
        <p className="text-[11px] text-[#6a6a6a] italic">Connect a source node first.</p>
      )}

      {columns.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#969696] uppercase tracking-wider flex-1">Columns</span>
            <button type="button" onClick={selectAll} className="text-[10px] text-[#4fc1ff] hover:underline">All</button>
            <span className="text-[#6a6a6a] text-[10px]">/</span>
            <button type="button" onClick={clearAll} className="text-[10px] text-[#969696] hover:underline">None</button>
          </div>

          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto scrollbar-thin">
            {columns.map(col => {
              const sel = config.columns.find(c => c.source === col.name)
              const checked = !!sel
              return (
                <div key={col.name} className={`flex items-center gap-2 px-2 py-1 rounded ${checked ? 'bg-[#1e3a5f]/40' : 'hover:bg-[#2d2d30]'} transition-colors`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(col.name)}
                    className="accent-[#0e639c] cursor-pointer"
                  />
                  <span className={`text-xs font-mono flex-1 truncate ${checked ? 'text-[#9cdcfe]' : 'text-[#6a6a6a]'}`}>
                    {col.name}
                  </span>
                  {checked && (
                    <input
                      type="text"
                      value={sel?.alias ?? ''}
                      onChange={e => setAlias(col.name, e.target.value)}
                      placeholder="alias"
                      className="w-20 bg-[#1e1e1e] border border-[#3c3c3c] text-[#969696] text-xs rounded px-1.5 py-0.5 outline-none"
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-[#6a6a6a]">
            {config.columns.length} of {columns.length} selected
          </p>
        </>
      )}
    </div>
  )
}
