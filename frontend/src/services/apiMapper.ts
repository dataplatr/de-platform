/**
 * API DTO mapper — single place where backend snake_case responses are
 * converted to typed frontend models. No component should access raw API
 * response shapes directly; use these mappers at the call site.
 */
import type { PreviewResult, ColumnType } from '../types'
import { normalizeColumnType } from '../utils/typeUtils'

// ─── Raw API shapes (what the backend actually sends) ─────────────────────────

interface RawPreviewResult {
  columns: { name: string; type: string }[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
  is_sampled?: boolean
}

export interface PipelineSummary {
  id: string
  name: string
  nodeCount: number
  createdAt: string
  updatedAt: string
}

export interface PipelineDetail {
  id: string
  name: string
  nodes: unknown[]
  edges: unknown[]
  createdAt: string
  updatedAt: string
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapPreviewResult(raw: unknown): PreviewResult {
  const r = raw as RawPreviewResult
  const cols = r.columns
  return {
    columns: cols.map((c) => ({
      name: c.name,
      type: normalizeColumnType(c.type) as ColumnType,
    })),
    rows: r.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c.name, row[i]]))),
    totalRows: r.row_count,
    executionMs: r.execution_time_ms,
    sampled: r.is_sampled ?? false,
  }
}

export function mapPipelineSummary(raw: unknown): PipelineSummary {
  const r = raw as Record<string, unknown>
  return {
    id: r.id as string,
    name: r.name as string,
    nodeCount: (r.node_count as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function mapPipelineDetail(raw: unknown): PipelineDetail {
  const r = raw as Record<string, unknown>
  return {
    id: r.id as string,
    name: r.name as string,
    nodes: (r.nodes as unknown[]) ?? [],
    edges: (r.edges as unknown[]) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}
