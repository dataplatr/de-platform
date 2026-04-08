/**
 * Node preview hook — SQL compilation trigger and preview execution.
 * Reads selected node + graph from store; writes back generated SQL and preview result.
 *
 * Preview uses the connection_alias from the first source node in the pipeline.
 * If no connection alias is found (no sources yet), preview is skipped with a toast.
 */
import { useCallback, useEffect } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { api } from '../services/api'
import { mapPreviewResult } from '../services/apiMapper'
import { notify } from '../services/notify'

function findConnectionAlias(nodes: ReturnType<typeof useTransformationStore.getState>['nodes']): string | null {
  const source = nodes.find(n => n.type === 'source' && n.connection_alias)
  return source?.connection_alias ?? null
}

export function useNodePreview() {
  const {
    selectedNodeId, nodes, edges,
    setGeneratedSQL, setOutputPreview, setPreviewLoading, setBottomPanelTab,
  } = useTransformationStore()

  // Regenerate SQL whenever the node config or graph changes
  useEffect(() => {
    if (!selectedNodeId) { setGeneratedSQL('-- Select a node to see its SQL'); return }
    api.compilePipeline(nodes, edges, selectedNodeId)
      .then(({ data }) => setGeneratedSQL(data.sql))
      .catch(() => setGeneratedSQL('-- Could not compile SQL'))
  }, [selectedNodeId, nodes, edges, setGeneratedSQL])

  const runPreview = useCallback(async () => {
    if (!selectedNodeId) return

    const connectionAlias = findConnectionAlias(nodes)
    if (!connectionAlias) {
      notify('error', 'No Databricks connection found. Add a source node from the Sources panel first.')
      return
    }

    setPreviewLoading(true)
    setBottomPanelTab('output')
    try {
      const { data } = await api.previewPipeline(nodes, edges, selectedNodeId, connectionAlias, 100)
      setOutputPreview(mapPreviewResult(data))
    } catch (err: unknown) {
      setOutputPreview(null)
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Preview failed — check node connections and config.'
      notify('error', detail)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedNodeId, nodes, edges, setPreviewLoading, setBottomPanelTab, setOutputPreview])

  return { runPreview }
}
