import { History, Code2 } from 'lucide-react'
import { StepHistory } from '../history/StepHistory'
import { SqlViewer } from '../sql/SqlViewer'
import { useTransformationStore } from '../../store/transformationStore'
import clsx from 'clsx'

const SQL_PANEL_HEIGHT = 220

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useTransformationStore()

  return (
    <div className="flex flex-col h-full">
      {/* Top section: Step History / Config */}
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

      {/* Divider */}
      <div className="h-px bg-[#3c3c3c] shrink-0" />

      {/* Bottom section: SQL Viewer */}
      <div className="shrink-0" style={{ height: SQL_PANEL_HEIGHT }}>
        <SqlViewer />
      </div>
    </div>
  )
}
