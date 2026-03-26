import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTransformationStore } from '../../store/transformationStore'
import { SourceNode } from './nodes/SourceNode'
import { FilterNode } from './nodes/FilterNode'
import { JoinNode } from './nodes/JoinNode'
import { AggregateNode } from './nodes/AggregateNode'
import { SelectNode } from './nodes/SelectNode'

const nodeTypes: NodeTypes = {
  source: SourceNode,
  filter: FilterNode,
  join: JoinNode,
  aggregate: AggregateNode,
  select: SelectNode,
}

export function TransformationCanvas() {
  const { nodes, edges, selectedNodeId, setSelectedNode, addEdge } = useTransformationStore()

  // Map store nodes → ReactFlow nodes
  const rfNodes: Node[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n },
    selected: n.id === selectedNodeId,
  }))

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    style: { stroke: '#4a4a4a', strokeWidth: 1.5 },
    animated: false,
  }))

  const onConnect = useCallback(
    (connection: { source: string | null; target: string | null }) => {
      if (!connection.source || !connection.target) return
      addEdge({
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
      })
    },
    [addEdge]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  return (
    <div className="flex-1 relative bg-[#1e1e1e] overflow-hidden min-h-0">
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="text-3xl mb-3">⬡</div>
            <p className="text-[#969696] text-sm font-medium">No nodes yet</p>
            <p className="text-[#6a6a6a] text-xs mt-1">
              Drag a table from the left panel, or describe a transformation below
            </p>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode="Delete"
        className="bg-[#1e1e1e]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#3c3c3c"
        />
        <Controls
          showInteractive={false}
          className="!border-[#3c3c3c] !bg-[#252526]"
        />
        <MiniMap
          nodeColor={(n) => {
            const type = n.type as string
            const colors: Record<string, string> = {
              source: '#1e3a5f',
              filter: '#3a2b1e',
              join: '#1e3a2b',
              aggregate: '#2b1e3a',
              select: '#1e2b3a',
            }
            return colors[type] ?? '#3c3c3c'
          }}
          maskColor="rgba(30,30,30,0.7)"
          style={{ background: '#252526', border: '1px solid #3c3c3c' }}
        />
      </ReactFlow>
    </div>
  )
}
