/**
 * Pipeline abstraction layer for the canvas.
 *
 * Rules:
 *   1. Anchors (source + output nodes) are ALWAYS visible.
 *   2. A "segment" is a direct path between two anchors (not through another anchor).
 *   3. Collapsed segment → intermediates hidden, replaced by a pipeline chip.
 *   4. Expanded segment  → intermediates visible inside a FigJam group.
 *   5. Orphan nodes (not part of any segment) are ALWAYS visible.
 *   6. Edges between ANY two visible nodes are ALWAYS rendered.
 *   7. No auto-expand. Ever. The user controls what's open.
 *
 * Edge visual model:
 *   - Transformation step nodes render as colored chip pills (TransformChipNode).
 *   - Edges are plain arrows — the chip is the node, not an edge overlay.
 *   - Join secondary edge (handle b) → dashed style via TransformChipEdge.
 */
import { useCallback, useMemo, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { useTransformationStore } from '../store/transformationStore'
import type { TransformNode, TransformEdge } from '../types'
import { getSegmentIntermediateIds, calcGroupBBox, OUTPUT_MARGIN } from '../utils/canvasUtils'

export interface PipelinePair {
  srcId: string
  outId: string
  intermediateIds: string[]
  stepNodes: TransformNode[]
}

/**
 * Build a plain ReactFlow edge.
 * Transformation chip nodes render the step identity themselves — edges are
 * just arrows. Only exception: Join's secondary (handle b) input gets the
 * dashed style via TransformChipEdge.
 */
function buildRfEdge(e: TransformEdge): Edge {
  if (e.targetHandle === 'b') {
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'transformChip',
      data: { isSecondaryJoin: true },
    }
  }

  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    style: { stroke: 'var(--pipe-stroke)', strokeWidth: 1.5 },
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePipelineExpansion(
  nodes: TransformNode[],
  edges: TransformEdge[],
  toRfNode: (n: TransformNode) => Node
) {
  const { expandedOutputId, setExpandedOutputId, setRightPanelTab } = useTransformationStore()
  const [expandedPipelineKey, setExpandedPipelineKey] = useState<string | null>(null)

  // ── Classify nodes ─────────────────────────────────────────────────────────
  const sourceNodes = useMemo(() => nodes.filter((n) => n.type === 'source'), [nodes])
  const outputNodes = useMemo(() => nodes.filter((n) => n.type === 'output'), [nodes])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // Anchors = sources + outputs — always visible, never hidden by abstraction
  const anchorIds = useMemo(
    () => new Set([...sourceNodes.map((n) => n.id), ...outputNodes.map((n) => n.id)]),
    [sourceNodes, outputNodes]
  )

  // Segment starts = sources + outputs that feed downstream
  const segmentStartIds = useMemo(() => {
    const starts = new Set(sourceNodes.map((n) => n.id))
    for (const out of outputNodes) {
      if (edges.some((e) => e.source === out.id)) starts.add(out.id)
    }
    return starts
  }, [sourceNodes, outputNodes, edges])

  // ── Build pipeline segments ────────────────────────────────────────────────
  const pipelinePairs = useMemo<PipelinePair[]>(() => {
    const pairs: PipelinePair[] = []
    for (const startId of segmentStartIds) {
      for (const out of outputNodes) {
        if (startId === out.id) continue
        const intermediateIds = getSegmentIntermediateIds(startId, out.id, edges, anchorIds)
        if (intermediateIds === null) continue
        const stepNodes = intermediateIds.flatMap((id) => {
          const n = nodeById.get(id)
          return n ? [n] : []
        })
        pairs.push({ srcId: startId, outId: out.id, intermediateIds, stepNodes })
      }
    }
    return pairs
  }, [segmentStartIds, outputNodes, nodeById, edges, anchorIds])

  const showAbstraction = pipelinePairs.length > 0

  // ── Expand / collapse ──────────────────────────────────────────────────────
  const handleExpand = useCallback(
    (key: string) => {
      setExpandedPipelineKey(key)
      setExpandedOutputId(null)
      setRightPanelTab('history')
    },
    [setRightPanelTab, setExpandedOutputId]
  )

  const handleCollapse = useCallback(() => {
    setExpandedPipelineKey(null)
    setExpandedOutputId(null)
  }, [setExpandedOutputId])

  // ── Derive ReactFlow nodes + edges ─────────────────────────────────────────
  const { rfNodes, rfEdges } = useMemo(() => {
    // ── No abstraction → raw pass-through ──────────────────────────────────
    if (!showAbstraction) {
      return {
        rfNodes: nodes.map(toRfNode),
        rfEdges: edges.map((e) => buildRfEdge(e)),
      }
    }

    // ── Which segments are currently expanded? ─────────────────────────────
    const expandedKeys = new Set<string>()

    // Output-level expansion (config panel toggle)
    const outputExpandedPairs = expandedOutputId
      ? pipelinePairs.filter((p) => p.outId === expandedOutputId)
      : []
    outputExpandedPairs.forEach((p) => expandedKeys.add(`${p.srcId}-->${p.outId}`))

    // Single chip expansion (edge chip click)
    const singleExpandedPair =
      !expandedOutputId && expandedPipelineKey
        ? (pipelinePairs.find((p) => `${p.srcId}-->${p.outId}` === expandedPipelineKey) ?? null)
        : null
    if (singleExpandedPair)
      expandedKeys.add(`${singleExpandedPair.srcId}-->${singleExpandedPair.outId}`)

    // ── Compute visible node set ───────────────────────────────────────────
    const allSegmentNodeIds = new Set(pipelinePairs.flatMap((p) => p.intermediateIds))
    const visibleNodeIds = new Set<string>()

    // Rule 1: Anchors always visible
    anchorIds.forEach((id) => visibleNodeIds.add(id))

    // Rule 4: Expanded segment intermediates visible
    for (const pair of pipelinePairs) {
      if (expandedKeys.has(`${pair.srcId}-->${pair.outId}`)) {
        pair.intermediateIds.forEach((id) => visibleNodeIds.add(id))
      }
    }

    // Rule 5: Orphans always visible
    for (const n of nodes) {
      if (!anchorIds.has(n.id) && !allSegmentNodeIds.has(n.id)) {
        visibleNodeIds.add(n.id)
      }
    }

    // ── Build RF nodes ─────────────────────────────────────────────────────
    let builtNodes: Node[] = nodes.filter((n) => visibleNodeIds.has(n.id)).map(toRfNode)

    // FigJam group for output-level expansion (consolidated)
    if (outputExpandedPairs.length > 0) {
      const groupIds = new Set<string>()
      outputExpandedPairs.forEach((p) => p.intermediateIds.forEach((id) => groupIds.add(id)))
      const positions = [...groupIds]
        .map((id) => nodeById.get(id)?.position)
        .filter((p): p is { x: number; y: number } => !!p)

      if (positions.length > 0) {
        const bbox = calcGroupBBox(positions)
        const outNode = nodeById.get(expandedOutputId!)
        const srcLabels = outputExpandedPairs
          .map((p) => nodeById.get(p.srcId)?.label ?? '')
          .filter(Boolean)
          .join(', ')

        builtNodes.unshift({
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

        const minOutX = bbox.x + bbox.width + OUTPUT_MARGIN
        builtNodes = builtNodes.map((n) =>
          n.id === expandedOutputId && n.position.x < minOutX
            ? { ...n, position: { x: minOutX, y: n.position.y } }
            : n
        )
      }
    }

    // FigJam group for single-segment expansion
    if (singleExpandedPair && singleExpandedPair.intermediateIds.length > 0) {
      const positions = singleExpandedPair.intermediateIds
        .map((id) => nodeById.get(id)?.position)
        .filter((p): p is { x: number; y: number } => !!p)

      if (positions.length > 0) {
        const bbox = calcGroupBBox(positions)
        builtNodes.unshift({
          id: `group-${singleExpandedPair.srcId}-${singleExpandedPair.outId}`,
          type: 'pipelineGroup',
          position: { x: bbox.x, y: bbox.y },
          data: {
            width: bbox.width,
            height: bbox.height,
            onClose: handleCollapse,
            srcLabel: nodeById.get(singleExpandedPair.srcId)?.label,
            outLabel: nodeById.get(singleExpandedPair.outId)?.label,
          },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
          style: { width: bbox.width, height: bbox.height },
        })

        const minOutX = bbox.x + bbox.width + OUTPUT_MARGIN
        builtNodes = builtNodes.map((n) =>
          n.id === singleExpandedPair.outId && n.position.x < minOutX
            ? { ...n, position: { x: minOutX, y: n.position.y } }
            : n
        )
      }
    }

    // ── Build edges ────────────────────────────────────────────────────────

    // Pipeline chips for COLLAPSED segments that have intermediates
    const pipelineRfEdges: Edge[] = pipelinePairs
      .filter((p) => !expandedKeys.has(`${p.srcId}-->${p.outId}`) && p.intermediateIds.length > 0)
      .map((pair) => {
        const key = `${pair.srcId}-->${pair.outId}`
        return {
          id: `pipeline-${pair.srcId}-${pair.outId}`,
          source: pair.srcId,
          target: pair.outId,
          type: 'pipeline',
          data: {
            steps: pair.stepNodes.map((n) => ({ type: n.type, label: n.label })),
            stepCount: pair.stepNodes.length,
            pipelineKey: key,
            onExpand: () => handleExpand(key),
          },
        } satisfies Edge
      })

    // Rule 6: Edges between ANY two visible nodes always render.
    // Only skip if a pipeline chip already connects the same source→target.
    const chipEndpoints = new Set(pipelineRfEdges.map((e) => `${e.source}:::${e.target}`))

    const realEdges: Edge[] = edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .filter((e) => !chipEndpoints.has(`${e.source}:::${e.target}`))
      .map((e) => buildRfEdge(e))

    return { rfNodes: builtNodes, rfEdges: [...pipelineRfEdges, ...realEdges] }
  }, [
    showAbstraction,
    nodes,
    edges,
    toRfNode,
    expandedOutputId,
    expandedPipelineKey,
    pipelinePairs,
    anchorIds,
    nodeById,
    handleExpand,
    handleCollapse,
  ])

  return { rfNodes, rfEdges, showAbstraction }
}
