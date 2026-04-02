import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type Node,
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
import { ContextMenu } from './ContextMenu'
import { SourceImportModal } from './SourceImportModal'
import type { TransformNode } from '../../types'
import { usePipelineExpansion } from '../../hooks/usePipelineExpansion'
import { useCanvasEventHandlers } from '../../hooks/useCanvasEventHandlers'

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

export function TransformationCanvas() {
  const { nodes, edges, selectedNodeId } = useTransformationStore()

  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const onInit = useCallback((instance: ReactFlowInstance) => { rfInstance.current = instance }, [])
  const measuredDims = useRef<Map<string, { width: number; height: number }>>(new Map())

  const [importPos, setImportPos] = useState<{ x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; flowX: number; flowY: number; nodeId?: string
  } | null>(null)

  const toRfNode = useCallback((n: TransformNode): Node => {
    const dims = measuredDims.current.get(n.id)
    return {
      id: n.id, type: n.type, position: n.position,
      data: { ...n }, selected: n.id === selectedNodeId,
      ...(dims ? { measured: dims } : {}),
    }
  }, [selectedNodeId])

  const { rfNodes, rfEdges } = usePipelineExpansion(nodes, edges, toRfNode)

  const {
    closeCtx, onConnect, onNodesChange, onEdgesChange,
    onNodeClick, onPaneClick, onPaneContextMenu, onNodeContextMenu,
    onDragOver, onDrop, buildMenuItems,
  } = useCanvasEventHandlers(rfInstance, measuredDims, setImportPos, setCtxMenu)

  return (
    <div className="flex-1 relative overflow-hidden min-h-0 canvas-bg" onDrop={onDrop} onDragOver={onDragOver}>
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
          nodeColor={n => ({
            source: 'var(--node-source-bg)', filter: 'var(--node-filter-bg)',
            join: 'var(--node-join-bg)', aggregate: 'var(--node-aggregate-bg)',
            select: 'var(--node-select-bg)', output: 'var(--node-output-bg)',
          }[n.type as string] ?? 'var(--border)')}
          maskColor="rgba(0,0,0,0.35)"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        />
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildMenuItems(ctxMenu)} onClose={closeCtx} />
      )}

      {importPos !== null && (
        <SourceImportModal position={importPos} onClose={() => setImportPos(null)} />
      )}
    </div>
  )
}
