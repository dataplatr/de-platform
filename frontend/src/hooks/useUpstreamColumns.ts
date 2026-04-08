/**
 * Upstream column resolution hook — derives available columns for the selected node.
 * Also auto-initialises Transform node config when upstream columns first become available.
 */
import { useEffect, useMemo } from 'react'
import type { TransformNode as TNode } from '../types'
import type { TransformColumnDef, TransformConfig as TransformCfg } from '../types'
import { useTransformationStore } from '../store/transformationStore'
import { getUpstreamColumns, getColumnsForHandle } from '../utils/graphUtils'

export function useUpstreamColumns(node: TNode | undefined) {
  const { nodes, edges, updateNode, selectedNodeId } = useTransformationStore()

  const incomingEdges = useMemo(
    () => edges.filter((e) => e.target === selectedNodeId),
    [edges, selectedNodeId]
  )

  const upstreamCols = useMemo(() => {
    if (!node) return []
    if (node.type === 'source') return node.columns ?? []
    return incomingEdges.length > 0 ? getUpstreamColumns(incomingEdges[0].source, nodes, edges) : []
  }, [node, incomingEdges, nodes, edges])

  // Auto-initialize Transform config from upstream columns when empty
  useEffect(() => {
    if (!node || node.type !== 'transform' || upstreamCols.length === 0) return
    const cfg = node.config as TransformCfg | null
    if (!cfg || cfg.columns.length === 0) {
      const init: TransformColumnDef[] = upstreamCols.map((c) => ({
        source: c.name,
        outputName: c.name,
        castType: '',
        expression: '',
        enabled: true,
      }))
      updateNode(node.id, { config: { columns: init } as TransformCfg })
    }
  }, [node, upstreamCols, updateNode])

  const leftCols = useMemo(
    () => (node ? getColumnsForHandle(node.id, 'a', nodes, edges) : []),
    [node, nodes, edges]
  )
  const rightCols = useMemo(
    () => (node ? getColumnsForHandle(node.id, 'b', nodes, edges) : []),
    [node, nodes, edges]
  )

  return { upstreamCols, leftCols, rightCols }
}
