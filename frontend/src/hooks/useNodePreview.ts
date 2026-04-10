/**
 * Node preview hook — SQL compilation trigger and preview execution.
 *
 * When the user clicks Preview:
 *   - output tab: runs the selected node's full upstream SQL (what comes OUT)
 *   - input tab:  runs the primary upstream node's SQL (what goes IN)
 *
 * Both run in parallel so the user can switch tabs immediately after.
 * Preview uses the connection_alias from the first source node in the pipeline.
 */
import { useCallback, useEffect } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { api } from '../services/api'
import { mapPreviewResult } from '../services/apiMapper'
import { notify } from '../services/notify'

function findConnectionAlias(
  nodes: ReturnType<typeof useTransformationStore.getState>['nodes']
): string | null {
  const source = nodes.find((n) => n.type === 'source' && n.connection_alias)
  return source?.connection_alias ?? null
}

export function useNodePreview() {
  const {
    selectedNodeId,
    nodes,
    edges,
    setGeneratedSQL,
    setOutputPreview,
    setInputPreview,
    setPreviewLoading,
    setBottomPanelTab,
  } = useTransformationStore()

  // Regenerate SQL whenever the node config or graph changes
  useEffect(() => {
    if (!selectedNodeId) {
      setGeneratedSQL('-- Select a node to see its SQL')
      return
    }
    api
      .compilePipeline(nodes, edges, selectedNodeId)
      .then(({ data }) => setGeneratedSQL(data.sql))
      .catch(() => setGeneratedSQL('-- Could not compile SQL'))
  }, [selectedNodeId, nodes, edges, setGeneratedSQL])

  const runPreview = useCallback(async () => {
    if (!selectedNodeId) return

    const connectionAlias = findConnectionAlias(nodes)
    if (!connectionAlias) {
      notify(
        'error',
        'No Databricks connection found. Add a source node from the Sources panel first.'
      )
      return
    }

    setPreviewLoading(true)
    setBottomPanelTab('output')

    // Find the primary upstream node to use as the "input" preview.
    // For Join nodes, prefer handle 'a' (left / primary input).
    const inputEdge =
      edges.find((e) => e.target === selectedNodeId && (e.targetHandle === 'a' || !e.targetHandle)) ??
      edges.find((e) => e.target === selectedNodeId)
    const inputNodeId = inputEdge?.source ?? null

    try {
      // Run output preview first — if validation fails (400), bail without
      // touching Databricks for the input preview.
      let outputOk = false
      try {
        const outputResponse = await api.previewPipeline(nodes, edges, selectedNodeId, connectionAlias, 100)
        setOutputPreview(mapPreviewResult(outputResponse.data))
        outputOk = true
      } catch (outputErr: unknown) {
        setOutputPreview(null)
        const detail =
          (outputErr as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Preview failed — check node connections and config.'
        notify('error', detail)
      }

      // Only fetch input preview when the output succeeded
      if (outputOk && inputNodeId) {
        try {
          const inputResponse = await api.previewPipeline(nodes, edges, inputNodeId, connectionAlias, 100)
          setInputPreview(mapPreviewResult(inputResponse.data))
        } catch {
          setInputPreview(null)
        }
      } else if (!outputOk) {
        setInputPreview(null)
      }
    } finally {
      setPreviewLoading(false)
    }
  }, [
    selectedNodeId,
    nodes,
    edges,
    setPreviewLoading,
    setBottomPanelTab,
    setOutputPreview,
    setInputPreview,
  ])

  return { runPreview }
}
