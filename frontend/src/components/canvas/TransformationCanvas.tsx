import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
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
import { OutputNode } from './nodes/OutputNode'
import { PipelineGroupNode } from './nodes/PipelineGroupNode'
import { PipelineEdge } from './edges/PipelineEdge'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { SourceImportModal } from './SourceImportModal'
import type { TransformNode, TransformEdge } from '../../types'
import { DEFAULT_CONFIGS, makeNodeId } from '../../constants/nodeDefaults'

const nodeTypes: NodeTypes = {
  source:        SourceNode,
  filter:        FilterNode,
  join:          JoinNode,
  aggregate:     AggregateNode,
  select:        SelectNode,
  transform:     TransformNodeComponent,
  deduplicate:   DeduplicateNode,
  output:        OutputNode,
  pipelineGroup: PipelineGroupNode,
}

const edgeTypes: EdgeTypes = {
  pipeline: PipelineEdge,
}

// ── BFS helpers ──────────────────────────────────────────────────────────────

function bfsReachable(startId: string, edges: TransformEdge[], forward: boolean): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)
    for (const e of edges) {
      const neighbor = forward
        ? (e.source === curr ? e.target : null)
        : (e.target === curr ? e.source : null)
      if (neighbor && !visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return visited
}

function getIntermediateNodeIds(srcId: string, outId: string, edges: TransformEdge[]): string[] {
  const forwardFromSrc  = bfsReachable(srcId, edges, true)
  const backwardFromOut = bfsReachable(outId, edges, false)
  const result: string[] = []
  for (const id of forwardFromSrc) {
    if (backwardFromOut.has(id) && id !== srcId && id !== outId) result.push(id)
  }
  return result
}

// ── BBox for FigJam group ────────────────────────────────────────────────────

const NODE_W = 200
const NODE_H = 120
const GROUP_PAD_X = 50
const GROUP_PAD_Y = 70
const OUTPUT_MARGIN = 100 // space between group right edge and output node

function calcGroupBBox(positions: { x: number; y: number }[]) {
  const minX = Math.min(...positions.map(p => p.x))
  const minY = Math.min(...positions.map(p => p.y))
  const maxX = Math.max(...positions.map(p => p.x + NODE_W))
  const maxY = Math.max(...positions.map(p => p.y + NODE_H))
  return {
    x:      minX - GROUP_PAD_X,
    y:      minY - GROUP_PAD_Y,
    width:  maxX - minX + GROUP_PAD_X * 2,
    height: maxY - minY + GROUP_PAD_Y * 2,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TransformationCanvas() {
  const {
    nodes, edges, selectedNodeId,
    setSelectedNode, addNode, removeNode, addEdge,
    updateNode, removeEdge, setRightPanelTab,
    expandedOutputId, setExpandedOutputId,
  } = useTransformationStore()

  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance
  }, [])

  const measuredDims = useRef<Map<string, { width: number; height: number }>>(new Map())

  const [importPos, setImportPos] = useState<{ x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; flowX: number; flowY: number; nodeId?: string
  } | null>(null)
  // local key for single-pair expand (edge click); store expandedOutputId for multi-pair (output config button)
  const [expandedPipelineKey, setExpandedPipelineKey] = useState<string | null>(null)

  const closeCtx = useCallback(() => setCtxMenu(null), [])

  // ── Node categories ──────────────────────────────────────────────────────
  const sourceNodes = useMemo(() => nodes.filter(n => n.type === 'source'), [nodes])
  const outputNodes = useMemo(() => nodes.filter(n => n.type === 'output'), [nodes])

  // ── BFS pipeline pairs ───────────────────────────────────────────────────
  // Build a lookup Map for O(1) node access instead of O(n) Array.find per pair
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const pipelinePairs = useMemo(() => {
    const pairs: {
      srcId: string; outId: string
      intermediateIds: string[]
      stepNodes: TransformNode[]
    }[] = []
    for (const src of sourceNodes) {
      for (const out of outputNodes) {
        const forward = bfsReachable(src.id, edges, true)
        if (!forward.has(out.id)) continue
        const intermediateIds = getIntermediateNodeIds(src.id, out.id, edges)
        const stepNodes = intermediateIds.flatMap(id => {
          const n = nodeById.get(id)
          return n ? [n] : []
        })
        pairs.push({ srcId: src.id, outId: out.id, intermediateIds, stepNodes })
      }
    }
    return pairs
  }, [sourceNodes, outputNodes, nodeById, edges])

  const showAbstraction = outputNodes.length > 0 && pipelinePairs.length > 0

  // ── Auto-expand when a new intermediate node is added in abstracted mode ─
  const prevNodeIdsRef = useRef(new Set(nodes.map(n => n.id)))
  useEffect(() => {
    const currentIds = new Set(nodes.map(n => n.id))
    const newIds = [...currentIds].filter(id => !prevNodeIdsRef.current.has(id))
    prevNodeIdsRef.current = currentIds

    if (!showAbstraction || expandedPipelineKey || newIds.length === 0) return

    const hasNewIntermediate = nodes.some(n =>
      newIds.includes(n.id) && n.type !== 'source' && n.type !== 'output'
    )
    if (hasNewIntermediate && pipelinePairs.length > 0) {
      // Clear any output-level expand so we can show the single-pair expansion
      setExpandedOutputId(null)
      const first = pipelinePairs[0]
      setExpandedPipelineKey(`${first.srcId}-->${first.outId}`)
    }
  }, [nodes, showAbstraction, expandedPipelineKey, pipelinePairs, setExpandedOutputId])

  // ── Expand / collapse handlers ───────────────────────────────────────────
  const handleExpand = useCallback((key: string) => {
    setExpandedPipelineKey(key)
    setExpandedOutputId(null) // clear output-level expand
    setRightPanelTab('history')
  }, [setRightPanelTab, setExpandedOutputId])

  const handleCollapse = useCallback(() => {
    setExpandedPipelineKey(null)
    setExpandedOutputId(null)
  }, [setExpandedOutputId])

  // ── toRfNode helper ──────────────────────────────────────────────────────
  const toRfNode = useCallback((n: TransformNode): Node => {
    const dims = measuredDims.current.get(n.id)
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n },
      selected: n.id === selectedNodeId,
      ...(dims ? { measured: dims } : {}),
    }
  }, [selectedNodeId])

  // ── Build RF nodes / edges ───────────────────────────────────────────────
  let rfNodes: Node[]
  let rfEdges: Edge[]

  if (showAbstraction) {
    // Which pairs are being expanded and how:
    // • expandedOutputId → merge ALL pairs for that output into ONE FigJam group
    // • expandedPipelineKey → expand only that single pair (edge click)
    const outputExpandedPairs = expandedOutputId
      ? pipelinePairs.filter(p => p.outId === expandedOutputId)
      : []
    const singleExpandedPair = !expandedOutputId && expandedPipelineKey
      ? (pipelinePairs.find(p => `${p.srcId}-->${p.outId}` === expandedPipelineKey) ?? null)
      : null

    // Set of all pair keys whose arrow chip should be hidden (replaced with real edges)
    const hiddenPairKeys = new Set<string>()
    outputExpandedPairs.forEach(p => hiddenPairKeys.add(`${p.srcId}-->${p.outId}`))
    if (singleExpandedPair) hiddenPairKeys.add(`${singleExpandedPair.srcId}-->${singleExpandedPair.outId}`)

    // Visible nodes: always source + output, plus all intermediate nodes in expanded pairs,
    // PLUS any node not yet part of any pipeline pair (orphans — newly added / unconnected)
    const allPairIntermediateIds = new Set(pipelinePairs.flatMap(p => p.intermediateIds))
    const visibleNodeIds = new Set([
      ...sourceNodes.map(n => n.id),
      ...outputNodes.map(n => n.id),
    ])
    outputExpandedPairs.forEach(p => p.intermediateIds.forEach(id => visibleNodeIds.add(id)))
    singleExpandedPair?.intermediateIds.forEach(id => visibleNodeIds.add(id))
    // Always show orphan/unconnected intermediate nodes
    nodes.forEach(n => {
      if (n.type !== 'source' && n.type !== 'output' && !allPairIntermediateIds.has(n.id)) {
        visibleNodeIds.add(n.id)
      }
    })

    rfNodes = nodes.filter(n => visibleNodeIds.has(n.id)).map(toRfNode)

    let maxGroupRight = 0

    // ── Case A: output-level expansion → ONE consolidated FigJam group ──
    if (outputExpandedPairs.length > 0) {
      const allIntermediateIds = new Set<string>()
      outputExpandedPairs.forEach(p => p.intermediateIds.forEach(id => allIntermediateIds.add(id)))

      const positions = [...allIntermediateIds]
        .map(id => nodes.find(n => n.id === id)?.position)
        .filter((p): p is { x: number; y: number } => Boolean(p))

      if (positions.length > 0) {
        const bbox = calcGroupBBox(positions)
        maxGroupRight = bbox.x + bbox.width

        const outNode = nodes.find(n => n.id === expandedOutputId)
        const srcLabels = outputExpandedPairs
          .map(p => nodes.find(n => n.id === p.srcId)?.label ?? '')
          .filter(Boolean)
          .join(', ')

        rfNodes.unshift({
          id: `group-output-${expandedOutputId}`,
          type: 'pipelineGroup',
          position: { x: bbox.x, y: bbox.y },
          data: {
            width: bbox.width,
            height: bbox.height,
            onClose: handleCollapse,
            srcLabel: srcLabels,
            outLabel: outNode?.label,
          },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
          style: { width: bbox.width, height: bbox.height },
        })
      }

      // Push the output node right of the group
      if (maxGroupRight > 0) {
        const minOutX = maxGroupRight + OUTPUT_MARGIN
        rfNodes = rfNodes.map(n => {
          if (n.id === expandedOutputId && n.position.x < minOutX) {
            return { ...n, position: { x: minOutX, y: n.position.y } }
          }
          return n
        })
      }
    }

    // ── Case B: single-pair expansion (edge click) ───────────────────────
    if (singleExpandedPair && singleExpandedPair.intermediateIds.length > 0) {
      const positions = singleExpandedPair.intermediateIds
        .map(id => nodes.find(n => n.id === id)?.position)
        .filter((p): p is { x: number; y: number } => Boolean(p))

      if (positions.length > 0) {
        const bbox = calcGroupBBox(positions)
        maxGroupRight = Math.max(maxGroupRight, bbox.x + bbox.width)

        const srcNode = nodes.find(n => n.id === singleExpandedPair.srcId)
        const outNode = nodes.find(n => n.id === singleExpandedPair.outId)

        rfNodes.unshift({
          id: `group-${singleExpandedPair.srcId}-${singleExpandedPair.outId}`,
          type: 'pipelineGroup',
          position: { x: bbox.x, y: bbox.y },
          data: {
            width: bbox.width,
            height: bbox.height,
            onClose: handleCollapse,
            srcLabel: srcNode?.label,
            outLabel: outNode?.label,
          },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
          style: { width: bbox.width, height: bbox.height },
        })

        const minOutX = bbox.x + bbox.width + OUTPUT_MARGIN
        rfNodes = rfNodes.map(n => {
          if (n.id === singleExpandedPair.outId && n.position.x < minOutX) {
            return { ...n, position: { x: minOutX, y: n.position.y } }
          }
          return n
        })
      }
    }

    // Pipeline edge chips for all pairs NOT currently expanded
    const pipelineRfEdges: Edge[] = pipelinePairs
      .filter(pair => !hiddenPairKeys.has(`${pair.srcId}-->${pair.outId}`))
      .map(pair => {
        const key = `${pair.srcId}-->${pair.outId}`
        return {
          id: `pipeline-${pair.srcId}-${pair.outId}`,
          source: pair.srcId,
          target: pair.outId,
          type: 'pipeline',
          data: {
            steps: pair.stepNodes.map(n => ({ type: n.type, label: n.label })),
            stepCount: pair.stepNodes.length,
            pipelineKey: key,
            onExpand: pair.intermediateIds.length > 0
              ? () => handleExpand(key)
              : undefined,
          },
        } satisfies Edge
      })

    // Real edges for all expanded nodes
    const realEdges: Edge[] = hiddenPairKeys.size > 0
      ? edges
          .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
          .map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            style: { stroke: 'var(--pipe-stroke)', strokeWidth: 1.5 },
          }))
      : []

    rfEdges = [...pipelineRfEdges, ...realEdges]
  } else {
    // Normal canvas — show all nodes and real edges
    rfNodes = nodes.map(toRfNode)
    rfEdges = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      style: { stroke: 'var(--pipe-stroke)', strokeWidth: 1.5 },
    }))
  }

  // ── Context menu ─────────────────────────────────────────────────────────
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

  const buildMenuItems = (): MenuItem[] => {
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
          onClick: () => { removeNode(nid); if (selectedNodeId === nid) setSelectedNode(null) },
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
            id: makeNodeId(),
            type,
            label: type === 'output'
              ? `output_${nodes.filter(n => n.type === 'output').length + 1}`
              : `${label} ${nodes.filter(n => n.type === type).length + 1}`,
            config: DEFAULT_CONFIGS[type],
            position: { x, y },
          })
        },
      })),
    ]
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/lakeflow-node')
    if (!raw || !rfInstance.current) return
    const data = JSON.parse(raw) as { tableRef: string; label: string; columns: { name: string; type: string; nullable: boolean }[] }
    const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode({
      id: makeNodeId(), type: 'source', label: data.label, tableRef: data.tableRef,
      columns: data.columns.map(c => ({ name: c.name, type: c.type as import('../../types').ColumnType, nullable: c.nullable })),
      config: null, position,
    })
  }, [addNode])

  // ── ReactFlow handlers ───────────────────────────────────────────────────
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    addEdge({
      id: `e-${connection.source}-${connection.target}-${connection.targetHandle ?? ''}`,
      source: connection.source, target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
    })
  }, [addEdge])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach(change => {
      if (change.type === 'position' && change.position) updateNode(change.id, { position: change.position })
      if (change.type === 'dimensions' && change.dimensions) measuredDims.current.set(change.id, change.dimensions)
    })
  }, [updateNode])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    changes.forEach(change => { if (change.type === 'remove') removeEdge(change.id) })
  }, [removeEdge])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'pipelineGroup') return
    setSelectedNode(node.id)
    if (node.type === 'output') setRightPanelTab('config')
  }, [setSelectedNode, setRightPanelTab])

  const onPaneClick = useCallback(() => { setSelectedNode(null); closeCtx() }, [setSelectedNode, closeCtx])

  const isEmpty = nodes.length === 0

  return (
    <div
      className="flex-1 relative overflow-hidden min-h-0 canvas-bg"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* Empty state */}
      {isEmpty && (
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
        nodes={rfNodes}
        edges={rfEdges}
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
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode="Delete"
        className="canvas-bg"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable zoomable
          nodeColor={n => ({ source: 'var(--node-source-bg)', filter: 'var(--node-filter-bg)', join: 'var(--node-join-bg)', aggregate: 'var(--node-aggregate-bg)', select: 'var(--node-select-bg)', output: 'var(--node-output-bg)' }[n.type as string] ?? 'var(--border)')}
          maskColor="rgba(0,0,0,0.35)"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        />
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildMenuItems()} onClose={closeCtx} />
      )}

      {importPos !== null && (
        <SourceImportModal position={importPos} onClose={() => setImportPos(null)} />
      )}
    </div>
  )
}
