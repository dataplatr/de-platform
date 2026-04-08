/**
 * Default configs for each node type when first created.
 * Previously duplicated between TransformationCanvas.tsx and CanvasToolbar.tsx.
 */
import type { TransformNode } from '../types'

export const DEFAULT_CONFIGS: Record<string, TransformNode['config']> = {
  filter: [],
  join: { joinType: 'INNER', conditions: [], rightTable: '' },
  aggregate: { groupBy: [], measures: [] },
  select: { columns: [] },
  transform: { columns: [] },
  deduplicate: { partitionBy: [], orderBy: '', orderDir: 'DESC' },
  output: { targetTable: 'output', targetCatalog: '', targetSchema: '' },
  source: null,
}

/** Generates a unique node ID */
export function makeNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}
