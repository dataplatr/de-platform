// ─── Data Source Types ────────────────────────────────────────────────────────

export type ColumnType = 'TEXT' | 'VARCHAR' | 'NUMBER' | 'INTEGER' | 'FLOAT' |
  'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'ARRAY' | 'OBJECT' | 'UNKNOWN'

export interface Column {
  name: string
  type: ColumnType
  nullable?: boolean
  sampleValues?: (string | number | boolean | null)[]
}

export interface TableSchema {
  database: string
  schema: string
  table: string
  columns: Column[]
  rowCount?: number
}

export interface DatabaseTree {
  name: string
  schemas: {
    name: string
    tables: { name: string; rowCount?: number }[]
  }[]
}

// ─── Transformation Node Types ────────────────────────────────────────────────

export type NodeType = 'source' | 'filter' | 'join' | 'aggregate' | 'select'

export interface FilterCondition {
  id: string
  column: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'NOT IN' | 'BETWEEN' | 'IS NULL' | 'IS NOT NULL' | 'LIKE'
  value: string | string[] | null
  logic?: 'AND' | 'OR'
}

export interface JoinConfig {
  rightTable: string
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER'
  conditions: { leftCol: string; rightCol: string }[]
}

export interface AggregationConfig {
  groupBy: string[]
  measures: { column: string; func: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'COUNT_DISTINCT'; alias?: string }[]
}

export interface SelectConfig {
  columns: { source: string; alias?: string }[]
}

export type NodeConfig = FilterCondition[] | JoinConfig | AggregationConfig | SelectConfig | null

export interface TransformNode {
  id: string
  type: NodeType
  label: string
  tableRef?: string       // for source nodes
  config: NodeConfig
  position: { x: number; y: number }
  sql?: string            // generated SQL for this node
  status?: 'idle' | 'running' | 'success' | 'error'
  errorMessage?: string
}

export interface TransformEdge {
  id: string
  source: string
  target: string
}

// ─── Transformation / Pipeline ────────────────────────────────────────────────

export interface Transformation {
  id: string
  name: string
  description?: string
  nodes: TransformNode[]
  edges: TransformEdge[]
  createdAt: string
  updatedAt: string
  createdBy?: string
  targetTable?: string
}

// ─── Step History ─────────────────────────────────────────────────────────────

export interface StepHistoryEntry {
  id: string
  nodeId: string
  nodeType: NodeType
  label: string
  summary: string
  timestamp: string
  status: 'pending' | 'applied' | 'rejected'
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewResult {
  columns: { name: string; type: ColumnType }[]
  rows: Record<string, unknown>[]
  totalRows: number
  executionMs?: number
  sampled?: boolean
}

// ─── AI / Chat ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  generatedNodes?: Partial<TransformNode>[]
}

// ─── Connection ───────────────────────────────────────────────────────────────

export interface SnowflakeConnection {
  account: string
  username: string
  warehouse?: string
  database?: string
  schema?: string
}

export interface CSVSource {
  id: string
  filename: string
  size: number
  columns: Column[]
  rowCount: number
}
