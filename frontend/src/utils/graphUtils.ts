/**
 * Pure graph-walking utilities for the pipeline canvas.
 *
 * These functions reason about node schemas (what columns flow through the
 * graph) without generating SQL. Extracted from sqlGenerator.ts so they can
 * survive the deletion of frontend SQL generation in Phase 4.
 */
import type {
  TransformNode,
  TransformEdge,
  AggregationConfig,
  SelectConfig,
  TransformConfig,
  Column,
} from '../types'

/**
 * Walk upstream from nodeId and return the output column schema.
 * Join nodes merge left (handle a) + right (handle b) columns.
 */
export function getUpstreamColumns(
  nodeId: string,
  nodes: TransformNode[],
  edges: TransformEdge[]
): Column[] {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return []
  if (node.type === 'source') return node.columns ?? []

  const incoming = edges.filter((e) => e.target === nodeId)
  if (!incoming.length) return []

  if (node.type === 'join') {
    const edgeA = incoming.find((e) => !e.targetHandle || e.targetHandle === 'a')
    const edgeB = incoming.find((e) => e.targetHandle === 'b')
    const leftCols = edgeA ? getUpstreamColumns(edgeA.source, nodes, edges) : []
    const rightCols = edgeB ? getUpstreamColumns(edgeB.source, nodes, edges) : []
    const seen = new Set<string>()
    const merged: Column[] = []
    ;[...leftCols, ...rightCols].forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name)
        merged.push(c)
      }
    })
    return merged
  }

  if (node.type === 'aggregate') {
    const cfg = node.config as AggregationConfig | null
    if (!cfg || (!cfg.groupBy.length && !cfg.measures.length)) {
      return getUpstreamColumns(incoming[0].source, nodes, edges)
    }
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    const groupCols = cfg.groupBy
      .map((name) => upstream.find((c) => c.name === name))
      .filter((c): c is Column => !!c)
    const measureCols: Column[] = cfg.measures.map((m) => ({
      name: m.alias || `${m.func.toLowerCase()}_${m.column}`,
      type: m.func === 'COUNT' || m.func === 'COUNT_DISTINCT' ? 'INTEGER' : 'FLOAT',
      nullable: true,
    }))
    return [...groupCols, ...measureCols]
  }

  if (node.type === 'select') {
    const cfg = node.config as SelectConfig | null
    if (!cfg || !cfg.columns.length) {
      return getUpstreamColumns(incoming[0].source, nodes, edges)
    }
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    return cfg.columns.map((c) => {
      const base = upstream.find((u) => u.name === c.source)
      return { name: c.alias || c.source, type: base?.type ?? 'UNKNOWN', nullable: base?.nullable }
    })
  }

  if (node.type === 'transform') {
    const cfg = node.config as TransformConfig | null
    if (!cfg || !cfg.columns.length) return getUpstreamColumns(incoming[0].source, nodes, edges)
    const upstream = getUpstreamColumns(incoming[0].source, nodes, edges)
    return cfg.columns
      .filter((c) => c.enabled)
      .map((c) => {
        const outName = c.outputName || c.source
        const base = upstream.find((u) => u.name === c.source)
        const type = c.castType || base?.type || 'UNKNOWN'
        return { name: outName, type: type as Column['type'], nullable: base?.nullable }
      })
  }

  // deduplicate, filter, output — pass through upstream unchanged
  return getUpstreamColumns(incoming[0].source, nodes, edges)
}

/** Get columns arriving through a specific Join handle (a = left, b = right) */
export function getColumnsForHandle(
  nodeId: string,
  handleId: 'a' | 'b',
  nodes: TransformNode[],
  edges: TransformEdge[]
): Column[] {
  const incoming = edges.filter(
    (e) =>
      e.target === nodeId &&
      (handleId === 'a' ? !e.targetHandle || e.targetHandle === 'a' : e.targetHandle === 'b')
  )
  if (!incoming.length) return []
  return getUpstreamColumns(incoming[0].source, nodes, edges)
}

/** BFS: collect all nodes reachable upstream from a given node */
export function getAllUpstream(
  nodeId: string,
  nodes: TransformNode[],
  edges: TransformEdge[]
): TransformNode[] {
  const result: TransformNode[] = []
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = nodes.find((n) => n.id === id)
    if (node && id !== nodeId) result.push(node)
    edges.filter((e) => e.target === id).forEach((e) => queue.push(e.source))
  }
  return result
}
