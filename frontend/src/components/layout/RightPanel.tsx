import { SqlViewer } from '../sql/SqlViewer'
import { NodeConfigPanel } from '../config/NodeConfigPanel'
import { useResize } from '../../hooks/useResize'

export function RightPanel() {
  // Vertical resize for SQL panel (min 60, max 500, default 220)
  const sql = useResize(220, 60, 500, 'y', true)

  return (
    <div className="themed-panel flex flex-col h-full border-l border-theme">
      {/* Panel body — Config only */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <NodeConfigPanel />
      </div>

      {/* Vertical resize handle for SQL panel */}
      <div
        onMouseDown={sql.onMouseDown}
        className="h-1.5 shrink-0 bg-elevated hover:bg-[var(--accent)] cursor-row-resize transition-colors flex items-center justify-center gap-1 group"
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
