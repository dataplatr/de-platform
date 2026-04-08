import { useCallback, useState } from 'react'
import { Plus, RefreshCw, Search, Settings } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { CachedTreeBrowser } from './CachedTreeBrowser'
import { SourceImportModal } from '../canvas/SourceImportModal'
import { DatabricksConnectModal } from '../settings/DatabricksConnectModal'
import clsx from 'clsx'

export function ObjectNavigator() {
  const { connections } = useTransformationStore()
  const [search, setSearch] = useState('')
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [treeKey, setTreeKey] = useState(0)

  const activeConn = connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null

  const handleSchemaDone = useCallback(() => {
    setTreeKey((k) => k + 1)
  }, [])

  return (
    <div className="themed-panel flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme bg-surface shrink-0">
        <span className="text-xs font-medium text-primary uppercase tracking-wider">Sources</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-button"
            title="Add source"
            onClick={() => setShowSourceModal(true)}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Manage connections"
            onClick={() => setShowConnectModal(true)}
          >
            <Settings size={12} />
          </button>
        </div>
      </div>

      {/* Connection tabs (if multiple) */}
      {connections.length > 1 && (
        <div className="flex overflow-x-auto border-b border-theme shrink-0">
          {connections.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveConnectionId(c.id)}
              className={clsx(
                'px-3 py-1.5 text-[11px] whitespace-nowrap border-b-2 transition-colors shrink-0',
                activeConn?.id === c.id
                  ? 'border-[#4ec9b0] text-[#cccccc]'
                  : 'border-transparent text-[#6a6a6a] hover:text-[#969696]'
              )}
            >
              {c.name || c.alias}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {connections.length > 0 && (
        <div className="px-2 py-1.5 border-b border-theme shrink-0">
          <div className="flex items-center gap-1.5 bg-elevated rounded px-2 py-1">
            <Search size={11} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Filter tables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs text-primary placeholder-[#6a6a6a] outline-none w-full"
            />
          </div>
        </div>
      )}

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {/* No connections CTA */}
        {connections.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#1e3a2b] flex items-center justify-center">
              <RefreshCw size={18} className="text-[#4ec9b0]" />
            </div>
            <p className="text-xs text-[#969696] font-medium">No sources yet</p>
            <p className="text-[11px] text-[#4a4a4a]">
              Connect Databricks to browse Unity Catalog, or upload a CSV file.
            </p>
            <button
              type="button"
              onClick={() => setShowSourceModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0e639c] text-white hover:bg-[#1177bb] transition-colors"
            >
              <Plus size={12} />
              Add Source
            </button>
          </div>
        )}

        {/* Cached tree — instant load from SQLite */}
        {activeConn && (
          <CachedTreeBrowser
            key={`${activeConn.id}-${treeKey}`}
            connection={activeConn}
            search={search}
          />
        )}
      </div>

      {showConnectModal && <DatabricksConnectModal onClose={() => setShowConnectModal(false)} />}

      {showSourceModal && (
        <SourceImportModal
          defaultTab={connections.length > 0 ? 'databricks' : 'local'}
          onClose={() => setShowSourceModal(false)}
          onSchemaDone={handleSchemaDone}
        />
      )}
    </div>
  )
}
