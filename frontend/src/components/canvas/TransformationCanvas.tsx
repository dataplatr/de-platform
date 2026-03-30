import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  type Connection,
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
import { ContextMenu, type MenuItem } from './ContextMenu'
import { SourceImportModal } from './SourceImportModal'
import type { TransformNode } from '../../types'

const nodeTypes: NodeTypes = {
  source:      SourceNode,
  filter:      FilterNode,
  join:        JoinNode,
  aggregate:   AggregateNode,
  select:      SelectNode,
  transform:   TransformNodeComponent,
  deduplicate: DeduplicateNode,
}

const makeId = () => `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const DEFAULT_CONFIGS: Record<string, TransformNode['config']> = {
  filter:      [],
  join:        { joinType: 'INNER', conditions: [], rightTable: '' },
  aggregate:   { groupBy: [], measures: [] },
  select:      { columns: [] },
  transform:   { columns: [] },
  deduplicate: { partitionBy: [], orderBy: '', orderDir: 'DESC' },
  source:      null,
}

export function TransformationCanvas() {
  const {
    nodes, edges, selectedNodeId,
    setSelectedNode, addNode, removeNode, addEdge,
    updateNode, removeEdge,
  } = useTransformationStore()

  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance
  }, [])

  // Cache node dimensions so MiniMap can render them (ReactFlow measures async)
  const measuredDims = useRef<Map<string, { width: number; height: number }>>(new Map())

  // ── Source import modal ────────────────────────────────────────────────────
  const [importPos, setImportPos] = useState<{ x: number; y: number } | null>(null)

  // ── Context menu ──────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; flowX: number; flowY: number;
    nodeId?: string
  } | null>(null)

  const closeCtx = useCallback(() => setCtxMenu(null), [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const pos = rfInstance.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 }
    setCtxMenu({ x: e.clientX, y: e.clientY, flowX: pos.x, flowY: pos.y })
  }, [])

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, flowX: 0, flowY: 0, nodeId: node.id })
  }, [])

  // ── Build context menu items ──────────────────────────────────────────────
  const buildMenuItems = (): MenuItem[] => {
    if (ctxMenu?.nodeId) {
      const nid = ctxMenu.nodeId
      const node = nodes.find(n => n.id === nid)
      return [
        { label: node?.label ?? 'Node', icon: '⬡', onClick: () => {}, disabled: true },
        { label: '', onClick: () => {}, separator: true },
        {
          label: 'Configure', icon: '⚙️',
          onClick: () => setSelectedNode(nid),
        },
        {
          label: 'Preview data', icon: '👁',
          onClick: () => { setSelectedNode(nid) },
        },
        {
          label: 'Duplicate', icon: '⧉',
          onClick: () => {
            if (!node) return
            addNode({
              ...node,
              id: makeId(),
              label: `${node.label} (copy)`,
              position: { x: node.position.x + 40, y: node.position.y + 40 },
            })
          },
        },
        { label: '', onClick: () => {}, separator: true },
        {
          label: 'Delete node', icon: '🗑', danger: true,
          onClick: () => { removeNode(nid); if (selectedNodeId === nid) setSelectedNode(null) },
        },
      ]
    }

    // Canvas context menu — add nodes
    const addItems: MenuItem[] = (
      [
        { type: 'source' as const,      label: 'Source',      icon: '🗃️' },
        { type: 'filter' as const,      label: 'Filter',      icon: '🔽' },
        { type: 'join' as const,        label: 'Join',        icon: '🔗' },
        { type: 'transform' as const,   label: 'Transform',   icon: '⚡' },
        { type: 'aggregate' as const,   label: 'Aggregate',   icon: '∑'  },
        { type: 'deduplicate' as const, label: 'Deduplicate', icon: '⊘'  },
        { type: 'select' as const,      label: 'Select',      icon: '📋' },
      ] as { type: TransformNode['type']; label: string; icon: string }[]
    ).map(({ type, label, icon }) => ({
      label: `Add ${label}`,
      icon,
      onClick: () => {
        const x = ctxMenu?.flowX ?? 200
        const y = ctxMenu?.flowY ?? 200
        if (type === 'source') {
          setImportPos({ x, y })
          return
        }
        addNode({
          id: makeId(),
          type,
          label: `${label} ${nodes.filter(n => n.type === type).length + 1}`,
          config: DEFAULT_CONFIGS[type],
          position: { x, y },
        })
      },
    }))

    return [
      { label: 'Add to canvas', onClick: () => {}, disabled: true, icon: '⊕' },
      { label: '', onClick: () => {}, separator: true },
      ...addItems,
    ]
  }

  // ── Drag & Drop from Navigator ────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/lakeflow-node')
    if (!raw || !rfInstance.current) return
    const data = JSON.parse(raw) as {
      tableRef: string; label: string; columns: { name: string; type: string; nullable: boolean }[]
    }
    const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode({
      id: makeId(),
      type: 'source',
      label: data.label,
      tableRef: data.tableRef,
      columns: data.columns.map((c: { name: string; type: string; nullable: boolean }) => ({
        name: c.name,
        type: c.type as import('../../types').ColumnType,
        nullable: c.nullable,
      })),
      config: null,
      position,
    })
  }, [addNode])

  // ── ReactFlow event handlers ──────────────────────────────────────────────
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    addEdge({
      id: `e-${connection.source}-${connection.target}-${connection.targetHandle ?? ''}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
    })
  }, [addEdge])

  // ── onNodesChange: persist positions + cache dimensions for MiniMap ─────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach(change => {
      if (change.type === 'position' && change.position) {
        updateNode(change.id, { position: change.position })
      }
      if (change.type === 'dimensions' && change.dimensions) {
        measuredDims.current.set(change.id, change.dimensions)
      }
    })
  }, [updateNode])

  // ── onEdgesChange: allow Delete key to remove edges ──────────────────────
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    changes.forEach(change => {
      if (change.type === 'remove') removeEdge(change.id)
    })
  }, [removeEdge])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id)
  }, [setSelectedNode])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    closeCtx()
  }, [setSelectedNode, closeCtx])

  // ── Map store → ReactFlow ────────────────────────────────────────────────
  const rfNodes: Node[] = nodes.map(n => {
    const dims = measuredDims.current.get(n.id)
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n },
      selected: n.id === selectedNodeId,
      ...(dims ? { measured: dims } : {}),
    }
  })

  const rfEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    style: { stroke: '#4a4a4a', strokeWidth: 1.5 },
    animated: false,
  }))

  return (
    <div
      className="flex-1 relative bg-[#1e1e1e] overflow-hidden min-h-0"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-40">⬡</div>
            <p className="text-[#969696] text-sm font-medium">Canvas is empty</p>
            <p className="text-[#6a6a6a] text-xs mt-1">
              Drag a table from the left panel, right-click to add a node, or use the toolbar above
            </p>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPaneContextMenu={onPaneContextMenu as any}
        onNodeContextMenu={onNodeContextMenu}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode="Delete"
        className="bg-[#1e1e1e]"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#3c3c3c" />
        <Controls showInteractive={false} className="!border-[#3c3c3c] !bg-[#252526]" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const colors: Record<string, string> = {
              source: '#1e3a5f', filter: '#3a2b1e',
              join: '#1e3a2b', aggregate: '#2b1e3a', select: '#1e2b3a',
            }
            return colors[n.type as string] ?? '#3c3c3c'
          }}
          maskColor="rgba(30,30,30,0.7)"
          style={{ background: '#252526', border: '1px solid #3c3c3c' }}
        />
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildMenuItems()}
          onClose={closeCtx}
        />
      )}

      {importPos !== null && (
        <SourceImportModal
          position={importPos}
          onClose={() => setImportPos(null)}
        />
      )}
    </div>
  )
}
