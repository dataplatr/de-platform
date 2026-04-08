/**
 * Pure canvas utility functions — BFS reachability and bounding-box math.
 * No React or store dependencies.
 */
import type { TransformEdge } from '../types'

/**
 * Standard BFS reachability — walks all edges forward or backward from startId.
 */
export function bfsReachable(
  startId: string,
  edges: TransformEdge[],
  forward: boolean
): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)
    for (const e of edges) {
      const neighbor = forward
        ? e.source === curr
          ? e.target
          : null
        : e.target === curr
          ? e.source
          : null
      if (neighbor && !visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return visited
}

/**
 * Anchor-aware BFS: walks edges but does NOT traverse *through* anchor nodes
 * (other than the start). It will *reach* an anchor but won't expand past it.
 * This prevents paths from "leaking" through intermediate output nodes.
 */
export function bfsReachableNoPassthrough(
  startId: string,
  edges: TransformEdge[],
  forward: boolean,
  anchorIds: Set<string>
): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)
    // Reached an anchor that isn't the start — record it but don't expand
    if (curr !== startId && anchorIds.has(curr)) continue
    for (const e of edges) {
      const neighbor = forward
        ? e.source === curr
          ? e.target
          : null
        : e.target === curr
          ? e.source
          : null
      if (neighbor && !visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return visited
}

/**
 * Find intermediate (non-anchor) node IDs on all paths between two anchors,
 * without traversing through other anchors. Returns null if outId is not
 * directly reachable from srcId (i.e. the path passes through another anchor).
 */
export function getSegmentIntermediateIds(
  srcId: string,
  outId: string,
  edges: TransformEdge[],
  anchorIds: Set<string>
): string[] | null {
  const forwardFromSrc = bfsReachableNoPassthrough(srcId, edges, true, anchorIds)
  if (!forwardFromSrc.has(outId)) return null // not directly reachable
  const backwardFromOut = bfsReachableNoPassthrough(outId, edges, false, anchorIds)
  const result: string[] = []
  for (const id of forwardFromSrc) {
    if (backwardFromOut.has(id) && id !== srcId && id !== outId && !anchorIds.has(id)) {
      result.push(id)
    }
  }
  return result
}

export const NODE_W = 200
export const NODE_H = 120
export const GROUP_PAD_X = 50
export const GROUP_PAD_Y = 70
export const OUTPUT_MARGIN = 100

export function calcGroupBBox(positions: { x: number; y: number }[]) {
  const minX = Math.min(...positions.map((p) => p.x))
  const minY = Math.min(...positions.map((p) => p.y))
  const maxX = Math.max(...positions.map((p) => p.x + NODE_W))
  const maxY = Math.max(...positions.map((p) => p.y + NODE_H))
  return {
    x: minX - GROUP_PAD_X,
    y: minY - GROUP_PAD_Y,
    width: maxX - minX + GROUP_PAD_X * 2,
    height: maxY - minY + GROUP_PAD_Y * 2,
  }
}
