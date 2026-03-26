import { History, Settings2 } from 'lucide-react'
import { StepHistory } from '../history/StepHistory'
import { SqlViewer } from '../sql/SqlViewer'
import { NodeConfigPanel } from '../config/NodeConfigPanel'
import { useTransformationStore } from '../../store/transformationStore'
import { useResize } from '../../hooks/useResize'
import clsx from 'clsx'

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab, selectedNodeId } = useTransformationStore()

  // Highlight Config tab when a node is selected
  const configHasNode = !!selectedNodeId

  // Vertical resize for SQL panel (min 60, max 500, default 220)
  const sql = useResize(220, 60, 500, 'y', true)

  return (
    <div className="flex flex-col h-full border-l border-[#3c3c3c]">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
        <button
          type="button"
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
          type="button"
          onClick={() => setRightPanelTab('config')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors',
            rightPanelTab === 'config'
              ? 'border-[#0e639c] text-[#cccccc]'
              : configHasNode
                ? 'border-transparent text-[#4fc1ff] hover:text-[#cccccc]'
                : 'border-transparent text-[#969696] hover:text-[#cccccc]'
          )}
        >
          <Settings2 size={12} />
          Config
          {configHasNode && rightPanelTab !== 'config' && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#4fc1ff] ml-0.5" />
          )}
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {rightPanelTab === 'history' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <StepHistory />
          </div>
        )}
        {rightPanelTab === 'config' && (
          <NodeConfigPanel />
        )}
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

      {/* SQL Viewer */}
      {/* eslint-disable-next-line react/forbid-component-props */}
      <div className="shrink-0 overflow-hidden" style={{ height: sql.size }}>
        <SqlViewer />
      </div>
    </div>
  )
}
