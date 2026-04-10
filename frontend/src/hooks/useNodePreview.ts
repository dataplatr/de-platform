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
      // Run output preview (selected node) and input preview (upstream) in parallel
      const outputPromise = api.previewPipeline(
        nodes,
        edges,
        selectedNodeId,
        connectionAlias,
        100
      )
      const inputPromise = inputNodeId
        ? api.previewPipeline(nodes, edges, inputNodeId, connectionAlias, 100)
        : Promise.resolve(null)

      const [outputResult, inputResult] = await Promise.allSettled([outputPromise, inputPromise])

      // Output preview
      if (outputResult.status === 'fulfilled') {
        setOutputPreview(mapPreviewResult(outputResult.value.data))
      } else {
        setOutputPreview(null)
        const detail =
          (
            outputResult.reason as {
              response?: { data?: { detail?: string } }
            }
          )?.response?.data?.detail ?? 'Preview failed — check node connections and config.'
        notify('error', detail)
      }

      // Input preview
      if (inputResult.status === 'fulfilled' && inputResult.value !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setInputPreview(mapPreviewResult((inputResult.value as any).data))
      } else {
        setInputPreview(null)
      }
    } catch (err: unknown) {
      setOutputPreview(null)
      setInputPreview(null)
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Preview failed — check node connections and config.'
      notify('error', detail)
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
