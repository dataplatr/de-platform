/**
 * Node preview hook — SQL compilation trigger and preview execution.
 * Reads selected node + graph from store; writes back generated SQL and preview result.
 */
import { useCallback, useEffect } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { api } from '../services/api'
import { mapPreviewResult } from '../services/apiMapper'

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
    setPreviewLoading(true)
    setBottomPanelTab('output')
    try {
      const { data } = await api.previewPipeline(nodes, edges, selectedNodeId, 100)
      setOutputPreview(mapPreviewResult(data))
    } catch {
      setOutputPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedNodeId, nodes, edges, setPreviewLoading, setBottomPanelTab, setOutputPreview])

  return { runPreview }
}
