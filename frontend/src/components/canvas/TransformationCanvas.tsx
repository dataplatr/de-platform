import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTransformationStore } from '../../store/transformationStore'
import { SourceNode } from './nodes/SourceNode'
import { FilterNode } from './nodes/FilterNode'
import { JoinNode } from './nodes/JoinNode'
import { AggregateNode } from './nodes/AggregateNode'
import { SelectNode } from './nodes/SelectNode'
import { TransformNode as TransformNodeComponent } from './nodes/TransformNode'
import { DeduplicateNode } from './nodes/DeduplicateNode'
import { OutputNode } from './nodes/OutputNode'
import { PipelineGroupNode } from './nodes/PipelineGroupNode'
import { PipelineEdge } from './edges/PipelineEdge'
import { TransformChipEdge } from './edges/TransformChipEdge'
import { ContextMenu } from './ContextMenu'
import { SourceImportModal } from './SourceImportModal'
import type { TransformNode } from '../../types'
import { usePipelineExpansion } from '../../hooks/usePipelineExpansion'
import { useCanvasEventHandlers } from '../../hooks/useCanvasEventHandlers'
import { useCanvasKeyboard } from '../../hooks/useCanvasKeyboard'
import { useEdgeSnapInsert } from '../../hooks/useEdgeSnapInsert'

const nodeTypes: NodeTypes = {
  source: SourceNode,
  filter: FilterNode,
  join: JoinNode,
  aggregate: AggregateNode,
  select: SelectNode,
  transform: TransformNodeComponent,
  deduplicate: DeduplicateNode,
  output: OutputNode,
  pipelineGroup: PipelineGroupNode,
}

const edgeTypes: EdgeTypes = {
  pipeline: PipelineEdge,
  transformChip: TransformChipEdge,
}

export function TransformationCanvas() {
  const { nodes, edges, updateNode, removeNode, removeEdge, setSelectedNode } =
    useTransformationStore()

  useCanvasKeyboard()

  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance
  }, [])

  const [importPos, setImportPos] = useState<{ x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    flowX: number
    flowY: number
    nodeId?: string
  } | null>(null)
  const [edgeCtxMenu, setEdgeCtxMenu] = useState<{ x: number; y: number; edgeId: string } | null>(
    null
  )

  const toRfNode = useCallback(
    (n: TransformNode): Node => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n },
    }),
    []
  )

  const { rfNodes, rfEdges } = usePipelineExpansion(nodes, edges, toRfNode)

  // ── ReactFlow controlled mode ──────────────────────────────────────────────
  // We keep RF nodes/edges in local state derived from the pipeline expansion hook.
  // applyNodeChanges/applyEdgeChanges handle selection, position, dimensions, removal
  // natively — this is what makes multi-select, drag-select, and delete actually work.
  const [localNodes, setLocalNodes] = useState<Node[]>([])
  const [localEdges, setLocalEdges] = useState<Edge[]>([])

  // Sync pipeline expansion output → local RF state.
  // We merge: keep RF-managed fields (selected, measured) but update position/data from store.
  const prevRfNodesRef = useRef<string>('')
  const prevRfEdgesRef = useRef<string>('')

  // Include config AND label in the key: chip nodes show the label as their
  // visible name, and config changes affect summaries — both must trigger a
  // local-nodes re-sync even if position/id didn't change.
  const rfNodesKey = JSON.stringify(
    rfNodes.map((n) => ({
      id: n.id,
      type: n.type,
      px: n.position.x,
      py: n.position.y,
      lbl: (n.data as { label?: string })?.label ?? '',
      cfg: (n.data as { config?: unknown })?.config ?? null,
    }))
  )
  const rfEdgesKey = JSON.stringify(rfEdges.map((e) => ({ id: e.id, s: e.source, t: e.target })))

  if (rfNodesKey !== prevRfNodesRef.current) {
    prevRfNodesRef.current = rfNodesKey
    const oldById = new Map(localNodes.map((n) => [n.id, n]))
    setLocalNodes(
      rfNodes.map((n) => {
        const old = oldById.get(n.id)
        return {
          ...n,
          // Preserve RF-managed state if the node existed before
          selected: old?.selected ?? false,
          measured: old?.measured ?? n.measured,
        }
      })
    )
  }

  if (rfEdgesKey !== prevRfEdgesRef.current) {
    prevRfEdgesRef.current = rfEdgesKey
    setLocalEdges(rfEdges)
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((prev) => applyNodeChanges(changes, prev))

      // Sync meaningful changes back to the zustand store
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          updateNode(c.id, { position: c.position })
        }
        if (c.type === 'remove') {
          removeNode(c.id)
        }
        if (c.type === 'select' && c.selected) {
          setSelectedNode(c.id)
        }
      }

      // If everything was deselected
      const anySelected = changes.some((c) => c.type === 'select' && c.selected)
      const allDeselected =
        changes.every((c) => c.type !== 'select' || !c.selected) &&
        changes.some((c) => c.type === 'select')
      if (allDeselected && !anySelected) {
        setSelectedNode(null)
      }
    },
    [updateNode, removeNode, setSelectedNode]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setLocalEdges((prev) => applyEdgeChanges(changes, prev))

      for (const c of changes) {
        if (c.type === 'remove') removeEdge(c.id)
      }
    },
    [removeEdge]
  )

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault()
    e.stopPropagation()
    setEdgeCtxMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
  }, [])

  const { onToolDrop, snapOrphanNode } = useEdgeSnapInsert(rfInstance, setImportPos)

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      snapOrphanNode(node.id, node.position)
    },
    [snapOrphanNode]
  )

  const {
    closeCtx,
    onConnect,
    onNodeClick,
    onPaneClick,
    onPaneContextMenu,
    onNodeContextMenu,
    onDragOver,
    onDrop: onSourceDrop,
    buildMenuItems,
  } = useCanvasEventHandlers(rfInstance, setImportPos, setCtxMenu)

  // Combined drop: tool-drag (edge-snap) takes priority over source-node-drag
  const [isDragOver, setIsDragOver] = useState(false)
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false)
      const consumed = onToolDrop(e)
      if (!consumed) onSourceDrop(e)
    },
    [onToolDrop, onSourceDrop]
  )

  const onDragOver2 = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(true)
      onDragOver(e)
    },
    [onDragOver]
  )

  const onDragLeave = useCallback(() => setIsDragOver(false), [])

  return (
    <div
      className="flex-1 relative overflow-hidden min-h-0 canvas-bg"
      onDrop={onDrop}
      onDragOver={onDragOver2}
      onDragLeave={onDragLeave}
      data-drag-over={isDragOver || undefined}
    >
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-40 canvas-empty-title">⬡</div>
            <p className="canvas-empty-title text-sm font-medium">Canvas is empty</p>
            <p className="canvas-empty-hint text-xs mt-1">
              Drag a table from the left panel, right-click, or use the toolbar
            </p>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPaneContextMenu={onPaneContextMenu as any}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnScroll
        zoomOnPinch
        className="canvas-bg"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            ({
              source: 'var(--node-source-bg)',
              filter: 'var(--node-intermediate-bg)',
              join: 'var(--node-intermediate-bg)',
              aggregate: 'var(--node-intermediate-bg)',
              select: 'var(--node-intermediate-bg)',
              transform: 'var(--node-intermediate-bg)',
              deduplicate: 'var(--node-intermediate-bg)',
              output: 'var(--node-output-bg)',
            })[n.type as string] ?? 'var(--border)'
          }
          maskColor="rgba(0,0,0,0.35)"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        />
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildMenuItems(ctxMenu)}
          onClose={closeCtx}
        />
      )}

      {edgeCtxMenu && (
        <ContextMenu
          x={edgeCtxMenu.x}
          y={edgeCtxMenu.y}
          onClose={() => setEdgeCtxMenu(null)}
          items={[
            {
              label: 'Delete connection',
              danger: true,
              onClick: () => {
                removeEdge(edgeCtxMenu.edgeId)
                setEdgeCtxMenu(null)
              },
            },
          ]}
        />
      )}

      {importPos !== null && (
        <SourceImportModal position={importPos} onClose={() => setImportPos(null)} />
      )}
    </div>
  )
}
