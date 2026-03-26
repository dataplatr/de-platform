import { Play, Save, Settings, Database, ChevronRight } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import clsx from 'clsx'

export function TopBar() {
  const { isConnected, nodes } = useTransformationStore()
  const hasNodes = nodes.length > 0

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-[#1e1e1e] border-b border-[#3c3c3c] shrink-0 z-10">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-[#969696]">
        <Database size={14} className="text-accent-light" />
        <span className="text-[#cccccc] font-medium">dataplatr</span>
        <ChevronRight size={12} />
        <span>Visual Transformation Builder</span>
        <ChevronRight size={12} />
        <span className="text-[#4fc1ff]">Untitled Pipeline</span>
      </div>

      {/* Center: Connection status */}
      <div className="flex items-center gap-2">
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          isConnected
            ? 'bg-[#1e3a2b] text-[#4ec9b0]'
            : 'bg-[#3a2b1e] text-[#dcdcaa]'
        )}>
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full',
            isConnected ? 'bg-[#4ec9b0]' : 'bg-[#dcdcaa]'
          )} />
          {isConnected ? 'DuckDB Connected' : 'No Connection'}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded hover:bg-[#3c3c3c] text-[#cccccc] transition-colors"
          title="Save pipeline"
        >
          <Save size={13} />
          <span>Save</span>
        </button>
        <button
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            hasNodes
              ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
              : 'bg-[#2d2d30] text-[#6a6a6a] cursor-not-allowed'
          )}
          disabled={!hasNodes}
          title="Run pipeline"
        >
          <Play size={13} />
          <span>Run</span>
        </button>
        <button
          className="icon-button ml-1"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}
