import { History, Code2 } from 'lucide-react'
import { StepHistory } from '../history/StepHistory'
import { SqlViewer } from '../sql/SqlViewer'
import { useTransformationStore } from '../../store/transformationStore'
import { useResize } from '../../hooks/useResize'
import clsx from 'clsx'

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useTransformationStore()

  // Vertical: SQL panel height (min 80, max 480, default 220) — inverted (drag up = grow)
  const sql = useResize(220, 80, 480, 'y', true)

  return (
    <div className="flex flex-col h-full border-l border-[#3c3c3c]">
      {/* Top section: Step History / Config — fills remaining space */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
          <button
            onClick={() => setRightPanelTab('history')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors',
              rightPanelTab === 'history'
                ? 'border-[#0e639c] text-[#cccccc]'
                : 'border-transparent text-[#969696] hover:text-[#cccccc]'
            )}
          >
            <History size={12} />
            Steps
          </button>
          <button
            onClick={() => setRightPanelTab('config')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors',
              rightPanelTab === 'config'
                ? 'border-[#0e639c] text-[#cccccc]'
                : 'border-transparent text-[#969696] hover:text-[#cccccc]'
            )}
          >
            <Code2 size={12} />
            Config
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {rightPanelTab === 'history' ? <StepHistory /> : (
            <div className="p-3 text-xs text-[#6a6a6a]">
              Select a node on the canvas to configure it.
            </div>
          )}
        </div>
      </div>

      {/* Vertical resize handle for SQL panel */}
      <div
        onMouseDown={sql.onMouseDown}
        className="h-1.5 shrink-0 bg-[#3c3c3c] hover:bg-accent cursor-row-resize transition-colors flex items-center justify-center gap-1 group"
      >
        <div className="w-0.5 h-0.5 rounded-full bg-white/60 opacity-0 group-hover:opacity-100" />
        <div className="w-0.5 h-0.5 rounded-full bg-white/60 opacity-0 group-hover:opacity-100" />
        <div className="w-0.5 h-0.5 rounded-full bg-white/60 opacity-0 group-hover:opacity-100" />
      </div>

      {/* Bottom: SQL Viewer — resizable height */}
      <div className="shrink-0 overflow-hidden" style={{ height: sql.size }}>
        <SqlViewer />
      </div>
    </div>
  )
}
