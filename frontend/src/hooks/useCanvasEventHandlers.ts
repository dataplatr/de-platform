/**
 * Canvas event handler hooks — connection, click, drag-drop, and context menu.
 * Node/edge change handlers live in TransformationCanvas (they need local RF state).
 */
import { useCallback } from 'react'
import type { Connection, ReactFlowInstance } from '@xyflow/react'
import type { MutableRefObject } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { makeNodeId, DEFAULT_CONFIGS } from '../constants/nodeDefaults'
import type { TransformNode } from '../types'

export function useCanvasEventHandlers(
  rfInstance: MutableRefObject<ReactFlowInstance | null>,
  setImportPos: (pos: { x: number; y: number } | null) => void,
  setCtxMenu: (menu: { x: number; y: number; flowX: number; flowY: number; nodeId?: string } | null) => void,
) {
  const {
    nodes, addNode, removeNode, addEdge,
    setSelectedNode, setRightPanelTab,
  } = useTransformationStore()

  const closeCtx = useCallback(() => setCtxMenu(null), [setCtxMenu])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      addEdge({
        id: `e-${connection.source}-${connection.target}-${connection.targetHandle ?? ''}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      })
    },
    [addEdge],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      if (node.type === 'pipelineGroup') return
      setSelectedNode(node.id)
      if (node.type === 'output') setRightPanelTab('config')
    },
    [setSelectedNode, setRightPanelTab],
  )

  const onPaneClick = useCallback(
    () => { setSelectedNode(null); closeCtx() },
    [setSelectedNode, closeCtx],
  )

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const pos = rfInstance.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 }
      setCtxMenu({ x: e.clientX, y: e.clientY, flowX: pos.x, flowY: pos.y })
    },
    [rfInstance, setCtxMenu],
  )

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: { id: string }) => {
      e.preventDefault()
      e.stopPropagation()
      setCtxMenu({ x: e.clientX, y: e.clientY, flowX: 0, flowY: 0, nodeId: node.id })
    },
    [setCtxMenu],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/lakeflow-node')
      if (!raw || !rfInstance.current) return
      const data = JSON.parse(raw) as {
        tableRef: string; label: string
        columns: { name: string; type: string; nullable: boolean }[]
      }
      const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode({
        id: makeNodeId(), type: 'source', label: data.label, tableRef: data.tableRef,
        columns: data.columns.map(c => ({ name: c.name, type: c.type as TransformNode['columns'] extends { type: infer T }[] ? T : never, nullable: c.nullable })),
        config: null, position,
      })
    },
    [addNode, rfInstance],
  )

  const buildMenuItems = useCallback(
    (ctxMenu: { x: number; y: number; flowX: number; flowY: number; nodeId?: string } | null) => {
      if (ctxMenu?.nodeId) {
        const nid = ctxMenu.nodeId
        const node = nodes.find(n => n.id === nid)
        return [
          { label: node?.label ?? 'Node', icon: '⬡', onClick: () => {}, disabled: true },
          { label: '', onClick: () => {}, separator: true },
          { label: 'Configure', icon: '⚙️', onClick: () => setSelectedNode(nid) },
          { label: 'Preview data', icon: '👁', onClick: () => setSelectedNode(nid) },
          {
            label: 'Duplicate', icon: '⧉',
            onClick: () => {
              if (!node) return
              addNode({ ...node, id: makeNodeId(), label: `${node.label} (copy)`, position: { x: node.position.x + 40, y: node.position.y + 40 } })
            },
          },
          { label: '', onClick: () => {}, separator: true },
          {
            label: 'Delete node', icon: '🗑', danger: true,
            onClick: () => removeNode(nid),
          },
        ]
      }

      const addTypes: { type: TransformNode['type']; label: string; icon: string }[] = [
        { type: 'source',      label: 'Source',      icon: '🗃️' },
        { type: 'filter',      label: 'Filter',      icon: '🔽' },
        { type: 'join',        label: 'Join',        icon: '🔗' },
        { type: 'transform',   label: 'Transform',   icon: '⚡' },
        { type: 'aggregate',   label: 'Aggregate',   icon: '∑'  },
        { type: 'deduplicate', label: 'Deduplicate', icon: '⊘'  },
        { type: 'select',      label: 'Select',      icon: '📋' },
        { type: 'output',      label: 'Output',      icon: '🎯' },
      ]

      return [
        { label: 'Add to canvas', onClick: () => {}, disabled: true, icon: '⊕' },
        { label: '', onClick: () => {}, separator: true },
        ...addTypes.map(({ type, label, icon }) => ({
          label: `Add ${label}`,
          icon,
          onClick: () => {
            const x = ctxMenu?.flowX ?? 200
            const y = ctxMenu?.flowY ?? 200
            if (type === 'source') { setImportPos({ x, y }); return }
            addNode({
              id: makeNodeId(), type, config: DEFAULT_CONFIGS[type],
              label: type === 'output'
                ? `output_${nodes.filter(n => n.type === 'output').length + 1}`
                : `${label} ${nodes.filter(n => n.type === type).length + 1}`,
              position: { x, y },
            })
          },
        })),
      ]
    },
    [nodes, addNode, removeNode, setSelectedNode, setImportPos],
  )

  return {
    closeCtx,
    onConnect,
    onNodeClick, onPaneClick,
    onPaneContextMenu, onNodeContextMenu,
    onDragOver, onDrop,
    buildMenuItems,
  }
}
