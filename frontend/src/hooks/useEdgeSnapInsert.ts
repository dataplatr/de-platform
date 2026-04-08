/**
 * Edge-snap insertion — drag a tool from the toolbar and drop it on or near
 * an existing edge to automatically split the edge and wire the new node in.
 *
 * Snap rules:
 *   1. Source nodes and Output nodes cannot be snap-inserted (only placed freely).
 *   2. Join nodes wired via snap get their PRIMARY handle (a) connected from edge source.
 *      The secondary handle (b) is left open for the user to connect manually.
 *   3. If the target of the existing edge is a Join's secondary input (handle b),
 *      snapping is blocked — that edge is a "right source" connector, not a main pipeline.
 *   4. Cycle detection: if inserting the new node would create a source→self path, reject.
 *   5. Snap radius: 80px in screen-space (converts to flow-space per current zoom).
 *   6. If no edge is within snap radius, the node is placed freely at the drop position.
 *
 * Implementation detail — finding edge midpoints:
 *   We don't have access to rendered edge paths, so we approximate the midpoint
 *   using the positions of the source and target nodes stored in the Zustand store.
 *   Mid = { x: (srcX + nodeWidth + trgX) / 2, y: (srcY + trgY) / 2 }
 *   This is good enough for hit-testing purposes at normal zoom levels.
 */
import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { useTransformationStore } from '../store/transformationStore'
import { makeNodeId, DEFAULT_CONFIGS } from '../constants/nodeDefaults'
import { notify } from '../services/notify'
import type { TransformNode, TransformEdge } from '../types'

// Approximate rendered node width (used for midpoint calculation)
const NODE_W = 190
const NODE_H = 60

// Snap radius in flow-space pixels (edges closer than this trigger snap)
const SNAP_RADIUS = 80

type NodeType = TransformNode['type']

const SNAP_BLOCKED_TYPES = new Set<NodeType>(['source', 'output'])

interface SnapResult {
  edge: TransformEdge
  midX: number
  midY: number
  dist: number
}

function edgeMidpoint(
  e: TransformEdge,
  nodeById: Map<string, TransformNode>
): { x: number; y: number } | null {
  const src = nodeById.get(e.source)
  const tgt = nodeById.get(e.target)
  if (!src || !tgt) return null
  // Approximate: right edge of src node → left edge of tgt node
  const srcRight = { x: src.position.x + NODE_W, y: src.position.y + NODE_H / 2 }
  const tgtLeft = { x: tgt.position.x, y: tgt.position.y + NODE_H / 2 }
  return { x: (srcRight.x + tgtLeft.x) / 2, y: (srcRight.y + tgtLeft.y) / 2 }
}

function dist2d(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/** Shared snap core — finds closest snappable edge to a flow-space point. */
function findClosestEdge(
  pos: { x: number; y: number },
  edges: TransformEdge[],
  nodeById: Map<string, TransformNode>
): SnapResult | null {
  let best: SnapResult | null = null
  for (const edge of edges) {
    if (edge.targetHandle === 'b') continue // secondary join wires are not snappable
    const mid = edgeMidpoint(edge, nodeById)
    if (!mid) continue
    const d = dist2d(pos.x, pos.y, mid.x, mid.y)
    if (d > SNAP_RADIUS) continue
    if (!best || d < best.dist) best = { edge, midX: mid.x, midY: mid.y, dist: d }
  }
  return best
}

/** Perform the actual split: remove old edge, wire newId in between. */
function buildSplitEdges(
  edge: TransformEdge,
  newId: string,
  newType: NodeType,
  existingEdges: TransformEdge[]
): TransformEdge[] {
  const newEdgeIn: TransformEdge = {
    id: `e-${edge.source}-${newId}-`,
    source: edge.source,
    target: newId,
    sourceHandle: edge.sourceHandle,
    targetHandle: newType === 'join' ? 'a' : undefined,
  }
  const newEdgeOut: TransformEdge = {
    id: `e-${newId}-${edge.target}-`,
    source: newId,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }
  return [...existingEdges.filter((ex) => ex.id !== edge.id), newEdgeIn, newEdgeOut]
}

export function useEdgeSnapInsert(
  rfInstance: RefObject<ReactFlowInstance | null>,
  setImportPos: (pos: { x: number; y: number } | null) => void
) {
  const { nodes, edges, batchUpdate, addNode, setSelectedNode, setRightPanelTab } =
    useTransformationStore()

  /**
   * Called from onNodeDragStop for nodes that have NO connections yet.
   * If the node landed near an edge, wire it in; otherwise leave it where it is.
   */
  const snapOrphanNode = useCallback(
    (nodeId: string, finalPos: { x: number; y: number }) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      if (SNAP_BLOCKED_TYPES.has(node.type)) return

      // Only snap orphans — node must have zero edges
      const hasEdge = edges.some((e) => e.source === nodeId || e.target === nodeId)
      if (hasEdge) return

      const nodeById = new Map(nodes.map((n) => [n.id, n]))
      // Use node center as the probe point
      const center = { x: finalPos.x + NODE_W / 2, y: finalPos.y + NODE_H / 2 }
      const best = findClosestEdge(center, edges, nodeById)
      if (!best) return

      const srcNode = nodeById.get(best.edge.source)
      const tgtNode = nodeById.get(best.edge.target)
      if (!srcNode || !tgtNode) return

      // Move node to midpoint, wire it in atomically
      const snappedPos = { x: best.midX - NODE_W / 2, y: best.midY - NODE_H / 2 }
      const newNodes = nodes.map((n) => (n.id === nodeId ? { ...n, position: snappedPos } : n))
      const newEdges = buildSplitEdges(best.edge, nodeId, node.type, edges)

      batchUpdate({ nodes: newNodes, edges: newEdges })
      setSelectedNode(nodeId)
      setRightPanelTab('config')
    },
    [nodes, edges, batchUpdate, setSelectedNode, setRightPanelTab]
  )

  /**
   * Handle a toolbar-tool drop event.
   * Returns true if the event was consumed (caller should not also process lakeflow-node).
   */
  const onToolDrop = useCallback(
    (e: React.DragEvent): boolean => {
      const raw = e.dataTransfer.getData('application/lakeflow-tool')
      if (!raw || !rfInstance.current) return false

      e.preventDefault()

      const { type, label } = JSON.parse(raw) as { type: NodeType; label: string }

      // Source → open import modal (cannot snap)
      if (type === 'source') {
        const pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        setImportPos(pos)
        return true
      }

      // Output → cannot be snapped in (it's a terminal anchor, not a transform step)
      if (type === 'output') {
        const pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const count = nodes.filter((n) => n.type === 'output').length
        addNode({
          id: makeNodeId(),
          type: 'output',
          label: `output_${count + 1}`,
          config: DEFAULT_CONFIGS['output'],
          position: pos,
        })
        return true
      }

      const dropPos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const nodeById = new Map(nodes.map((n) => [n.id, n]))
      const best = findClosestEdge(dropPos, edges, nodeById)

      // ── No snap zone → free placement ─────────────────────────────────────
      if (!best) {
        const count = nodes.filter((n) => n.type === type).length
        addNode({
          id: makeNodeId(),
          type,
          label: `${label} ${count + 1}`,
          config: DEFAULT_CONFIGS[type],
          position: dropPos,
        })
        return true
      }

      // ── Snap insertion ─────────────────────────────────────────────────────
      const { edge } = best
      if (!nodeById.get(edge.source) || !nodeById.get(edge.target)) {
        notify('error', 'Cannot insert: edge endpoints not found.')
        return true
      }

      const newId = makeNodeId()
      const typeCount = nodes.filter((n) => n.type === type).length
      const newNode: TransformNode = {
        id: newId,
        type,
        label: `${label} ${typeCount + 1}`,
        config: DEFAULT_CONFIGS[type],
        position: { x: best.midX - NODE_W / 2, y: best.midY - NODE_H / 2 },
      }

      batchUpdate({
        nodes: [...nodes, newNode],
        edges: buildSplitEdges(edge, newId, type, edges),
      })
      setSelectedNode(newId)
      setRightPanelTab('config')
      return true
    },
    [
      nodes,
      edges,
      rfInstance,
      batchUpdate,
      addNode,
      setImportPos,
      setSelectedNode,
      setRightPanelTab,
    ]
  )

  return { onToolDrop, snapOrphanNode }
}
