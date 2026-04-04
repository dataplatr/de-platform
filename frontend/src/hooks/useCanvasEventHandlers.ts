/**
 * Canvas event handler hooks — connection, click, drag-drop, and context menu.
 * Node/edge change handlers live in TransformationCanvas (they need local RF state).
 */
import { useCallback } from 'react'
import type { Connection, ReactFlowInstance } from '@xyflow/react'
import type { MutableRefObject } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { makeNodeId, DEFAULT_CONFIGS } from '../constants/nodeDefaults'
import { notify } from '../services/notify'
import type { TransformNode } from '../types'

export function useCanvasEventHandlers(
  rfInstance: MutableRefObject<ReactFlowInstance | null>,
  setImportPos: (pos: { x: number; y: number } | null) => void,
  setCtxMenu: (menu: { x: number; y: number; flowX: number; flowY: number; nodeId?: string } | null) => void,
) {
  const {
    nodes, edges, addNode, removeNode, addEdge,
    setSelectedNode, setRightPanelTab,
  } = useTransformationStore()

  const closeCtx = useCallback(() => setCtxMenu(null), [setCtxMenu])

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection
      if (!source || !target) return

      // Self-loop
      if (source === target) {
        notify('warning', 'Cannot connect a node to itself.')
        return
      }

      // Duplicate edge (same source → same target handle)
      const duplicate = edges.some(
        e => e.source === source && e.target === target && (e.targetHandle ?? null) === (targetHandle ?? null),
      )
      if (duplicate) {
        notify('warning', 'These nodes are already connected.')
        return
      }

      // Join validation: both inputs must come from different source nodes
      const targetNode = nodes.find(n => n.id === target)
      if (targetNode?.type === 'join') {
        const existingJoinEdges = edges.filter(e => e.target === target)
        const otherHandle = targetHandle === 'a' ? 'b' : 'a'
        const conflicting = existingJoinEdges.find(
          e => e.targetHandle === otherHandle && e.source === source,
        )
        if (conflicting) {
          notify('error', 'Both Join inputs cannot come from the same source node.')
          return
        }
      }

      addEdge({
        id: `e-${source}-${target}-${targetHandle ?? ''}`,
        source,
        target,
        sourceHandle: sourceHandle ?? undefined,
        targetHandle: targetHandle ?? undefined,
      })
    },
    [addEdge, edges, nodes],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      if (node.type === 'pipelineGroup') return
      setSelectedNode(node.id)
      // Transformation nodes and output nodes open the config panel on click.
      // Source nodes just select (schema visible in config panel too).
      const opensConfig = new Set(['output', 'filter', 'join', 'aggregate', 'select', 'transform', 'deduplicate'])
      if (node.type && opensConfig.has(node.type)) setRightPanelTab('config')
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
        tableRef: string; label: string; sourceType?: 'table' | 'view' | 'csv'
        columns: { name: string; type: string; nullable: boolean }[]
      }
      const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode({
        id: makeNodeId(), type: 'source', label: data.label, tableRef: data.tableRef,
        sourceType: data.sourceType ?? 'table',
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
        const typeLabel = node?.type
          ? node.type.charAt(0).toUpperCase() + node.type.slice(1)
          : 'Node'
        return [
          { label: node?.label ?? 'Node', onClick: () => {}, disabled: true },
          { label: '', onClick: () => {}, separator: true },
          { label: `Configure ${typeLabel}`, onClick: () => { setSelectedNode(nid); setRightPanelTab('config') } },
          { label: 'Preview data', onClick: () => { setSelectedNode(nid); setRightPanelTab('history') } },
          {
            label: 'Duplicate',
            onClick: () => {
              if (!node) return
              addNode({ ...node, id: makeNodeId(), label: `${node.label} copy`, position: { x: node.position.x + 40, y: node.position.y + 40 } })
            },
          },
          { label: '', onClick: () => {}, separator: true },
          {
            label: 'Delete node', danger: true,
            onClick: () => removeNode(nid),
          },
        ]
      }

      const addTypes: { type: TransformNode['type']; label: string }[] = [
        { type: 'source',      label: 'Source'      },
        { type: 'filter',      label: 'Filter'      },
        { type: 'join',        label: 'Join'        },
        { type: 'transform',   label: 'Transform'   },
        { type: 'aggregate',   label: 'Aggregate'   },
        { type: 'deduplicate', label: 'Deduplicate' },
        { type: 'select',      label: 'Select'      },
        { type: 'output',      label: 'Output'      },
      ]

      return [
        { label: 'Add to canvas', onClick: () => {}, disabled: true },
        { label: '', onClick: () => {}, separator: true },
        ...addTypes.map(({ type, label }) => ({
          label: `Add ${label}`,
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
    [nodes, addNode, removeNode, setSelectedNode, setRightPanelTab, setImportPos],
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
