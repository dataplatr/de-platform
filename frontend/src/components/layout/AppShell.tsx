import { useEffect, useRef, useState } from 'react'
import { TopBar } from './TopBar'
import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'
import { WarehousePickerModal } from '../settings/WarehousePickerModal'
import { useResize } from '../../hooks/useResize'
import { useTransformationStore } from '../../store/transformationStore'
import { api } from '../../services/api'
import type { DatabricksConnection } from '../../types'

function ResizeHandle({
  axis,
  onMouseDown,
}: {
  axis: 'x' | 'y'
  onMouseDown: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={
        axis === 'x'
          ? 'w-1 shrink-0 resize-handle cursor-col-resize group relative z-20'
          : 'h-1 shrink-0 resize-handle cursor-row-resize group relative z-20'
      }
    >
      {/* Visual grip dots */}
      <div
        className={
          axis === 'x'
            ? 'absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100'
            : 'absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-row items-center justify-center gap-1 opacity-0 group-hover:opacity-100'
        }
      >
        <div className="w-0.5 h-0.5 rounded-full bg-white/60" />
        <div className="w-0.5 h-0.5 rounded-full bg-white/60" />
        <div className="w-0.5 h-0.5 rounded-full bg-white/60" />
      </div>
    </div>
  )
}

export function AppShell() {
  const { setConnections, connections, pipelineConnectionAlias, setWarehouseState } =
    useTransformationStore()
  const [warehousePickTarget, setWarehousePickTarget] = useState<DatabricksConnection | null>(null)

  // Horizontal: left panel (min 160, max 480, default 260)
  const left = useResize(260, 160, 480, 'x', false)
  // Horizontal: right panel (min 180, max 520, default 288) — inverted (drag left = grow)
  const right = useResize(288, 180, 520, 'x', true)

  // Load connections on mount
  useEffect(() => {
    api
      .listConnections()
      .then(({ data }) => setConnections(data as DatabricksConnection[]))
      .catch(() => {
        /* backend unreachable — connections stay empty */
      })
  }, [setConnections])

  // After connections load: auto-start the warehouse and poll until RUNNING.
  // Shows WarehousePickerModal if the connection has no warehouse_id configured.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const conn = connections.find((c) => c.alias === pipelineConnectionAlias) ?? connections[0]
    if (!conn) return

    if (!conn.warehouse_id) {
      setWarehousePickTarget(conn)
      return
    }

    let cancelled = false
    let polls = 0
    const MAX_POLLS = 20 // 20 × 3 s = 60 s max warm-up

    setWarehouseState('STARTING')
    // Fire-and-forget — backend returns immediately; warehouse starts async
    api.startWarehouse(conn.id).catch(() => {})

    const poll = async () => {
      if (cancelled) return
      try {
        const { data } = await api.getWarehouseStatus(conn.id)
        if (cancelled) return
        setWarehouseState(data.state)
        polls++
        if (data.state !== 'RUNNING' && polls < MAX_POLLS) {
          pollTimerRef.current = setTimeout(poll, 3000)
        }
      } catch {
        if (!cancelled) setWarehouseState(null)
      }
    }

    // First check after 1 s (warehouse may already be RUNNING)
    pollTimerRef.current = setTimeout(poll, 1000)

    return () => {
      cancelled = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [connections, pipelineConnectionAlias, setWarehouseState])

  return (
    <div className="app-shell flex flex-col h-full select-none">
      <TopBar />

      {warehousePickTarget && (
        <WarehousePickerModal
          connection={warehousePickTarget}
          onClose={() => setWarehousePickTarget(null)}
        />
      )}

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        {/* eslint-disable-next-line react/forbid-component-props */}
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: left.size }}>
          <LeftPanel />
        </div>

        {/* Left resize handle */}
        <ResizeHandle axis="x" onMouseDown={left.onMouseDown} />

        {/* Center Panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <CenterPanel />
        </div>

        {/* Right resize handle */}
        <ResizeHandle axis="x" onMouseDown={right.onMouseDown} />

        {/* Right Panel */}
        {/* eslint-disable-next-line react/forbid-component-props */}
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: right.size }}>
          <RightPanel />
        </div>
      </div>
    </div>
  )
}
