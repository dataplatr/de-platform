import axios from 'axios'
import type { DatabricksConnection } from '../types'

// With Vite proxy, all /api/* calls go to http://localhost:8000 automatically.
export const apiClient = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

// ─── Request interceptor: attach auth token ───────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response interceptor: 401 → force logout ────────────────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ─── API helpers ──────────────────────────────────────────────────────────────

export const api = {
  // Health
  health: () => apiClient.get<{ status: string }>('/api/health'),

  // Auth
  login: (username: string, password: string) =>
    apiClient.post<{ access_token: string; username: string; role: string }>('/api/auth/login', { username, password }),
  logout: () => apiClient.post('/api/auth/logout'),
  me: () => apiClient.get('/api/auth/me'),

  // Users (admin)
  listUsers: () => apiClient.get('/api/users'),
  createUser: (payload: { username: string; email?: string; password: string; role: string }) =>
    apiClient.post('/api/users', payload),
  deactivateUser: (id: number) => apiClient.delete(`/api/users/${id}`),

  // Audit
  auditLog: (limit = 200, offset = 0) => apiClient.get(`/api/audit?limit=${limit}&offset=${offset}`),
  myActivity: () => apiClient.get('/api/audit/me'),

  // ─── Connections ─────────────────────────────────────────────────────────────
  listConnections: () => apiClient.get<DatabricksConnection[]>('/api/connections'),
  deleteConnection: (id: string) => apiClient.delete(`/api/connections/${id}`),
  createConnection: (payload: {
    alias: string; name?: string; host: string; token: string; warehouse_id: string
    upload_catalog?: string; upload_schema?: string; upload_volume?: string
  }) => apiClient.post<DatabricksConnection>('/api/connections', payload),
  updateConnection: (id: string, payload: {
    warehouse_id?: string; upload_catalog?: string; upload_schema?: string
    upload_volume?: string; name?: string
  }) => apiClient.patch<DatabricksConnection>(`/api/connections/${id}`, payload),

  // ─── OAuth PKCE flow ──────────────────────────────────────────────────────────
  oauthStart: (workspaceUrl: string, connectionName: string, connectionAlias: string) =>
    apiClient.post<{ auth_url: string }>('/api/connections/oauth/start', {
      workspace_url: workspaceUrl,
      connection_name: connectionName,
      connection_alias: connectionAlias,
    }),

  // ─── PAT validation + warehouse discovery (no record created) ─────────────────
  discoverWarehouses: (host: string, token: string) =>
    apiClient.post<{ id: string; name: string; state: string; cluster_size: string }[]>(
      '/api/connections/discover-warehouses', { host, token }
    ),

  // ─── Warehouses ───────────────────────────────────────────────────────────────
  listWarehouses: (connectionId: string) =>
    apiClient.get<{ id: string; name: string; state: string; cluster_size: string }[]>(
      `/api/connections/${connectionId}/warehouses`
    ),

  // ─── Schema metadata cache ────────────────────────────────────────────────────
  getSelectedSchemas: (connectionId: string) =>
    apiClient.get<{ id: string; connection_id: string; catalog: string; schema: string; synced_at: string | null }[]>(
      `/api/connections/${connectionId}/selected-schemas`
    ),
  addSchema: (connectionId: string, catalog: string, schema: string) =>
    apiClient.post(`/api/connections/${connectionId}/selected-schemas`, { catalog, schema }),
  removeSchema: (connectionId: string, catalog: string, schema: string) =>
    apiClient.delete(`/api/connections/${connectionId}/selected-schemas/${catalog}/${schema}`),
  getCachedTables: (connectionId: string) =>
    apiClient.get<{
      selected_schemas: { catalog: string; schema: string; synced_at: string | null }[]
      tables: { catalog: string; schema: string; table_name: string; table_type: string; columns: { name: string; type: string; nullable: boolean }[]; synced_at: string }[]
    }>(`/api/connections/${connectionId}/cached-tables`),
  syncSchemas: (connectionId: string) =>
    apiClient.post(`/api/connections/${connectionId}/sync`),

  // ─── Warehouse lifecycle ──────────────────────────────────────────────────────
  startWarehouse: (connectionId: string) =>
    apiClient.post<{ status: string }>(`/api/connections/${connectionId}/warehouse/start`),
  stopWarehouse: (connectionId: string) =>
    apiClient.post<{ status: string }>(`/api/connections/${connectionId}/warehouse/stop`),
  getWarehouseStatus: (connectionId: string) =>
    apiClient.get<{ state: string }>(`/api/connections/${connectionId}/warehouse/status`),

  // ─── Catalog tree (lazy) ──────────────────────────────────────────────────────
  listCatalogs: (connectionId: string) =>
    apiClient.get<{ name: string }[]>(`/api/connections/${connectionId}/tree`),
  listSchemas: (connectionId: string, catalog: string) =>
    apiClient.get<{ name: string; catalog: string }[]>(`/api/connections/${connectionId}/tree/${catalog}`),
  listTables: (connectionId: string, catalog: string, schema: string) =>
    apiClient.get<{ name: string; catalog: string; schema: string; table_type: string }[]>(
      `/api/connections/${connectionId}/tree/${catalog}/${schema}`
    ),
  listColumns: (connectionId: string, catalog: string, schema: string, table: string) =>
    apiClient.get<{ name: string; type: string; nullable: boolean }[]>(
      `/api/connections/${connectionId}/tree/${catalog}/${schema}/${table}/columns`
    ),

  // ─── CSV upload ───────────────────────────────────────────────────────────────
  uploadCSV: (
    connectionId: string,
    file: File,
    opts?: { targetCatalog?: string; targetSchema?: string; tableName?: string },
  ) => {
    const form = new FormData()
    form.append('file', file)
    if (opts?.targetCatalog) form.append('target_catalog', opts.targetCatalog)
    if (opts?.targetSchema)  form.append('target_schema',  opts.targetSchema)
    if (opts?.tableName)     form.append('table_name',     opts.tableName)
    return apiClient.post<{ table_ref: string; row_count: number; columns: { name: string; type: string; nullable: boolean }[] }>(
      `/api/connections/${connectionId}/upload-csv`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },

  // ─── Pipeline compile / preview / run ─────────────────────────────────────────
  compilePipeline: (nodes: unknown[], edges: unknown[], targetNodeId: string) =>
    apiClient.post<{ sql: string; target_node_id: string }>('/api/pipelines/compile', {
      nodes, edges, target_node_id: targetNodeId,
    }),
  previewPipeline: (
    nodes: unknown[], edges: unknown[], targetNodeId: string,
    connectionAlias: string, limit = 100
  ) =>
    apiClient.post('/api/pipelines/preview', {
      nodes, edges, target_node_id: targetNodeId, connection_alias: connectionAlias, limit,
    }),
  runPipeline: (
    nodes: unknown[], edges: unknown[], outputNodeId: string,
    connectionAlias: string, dialect = 'databricks'
  ) =>
    apiClient.post<{ execution_ms: number; statement_id: string; target_table: string; status: string }>(
      '/api/pipelines/run',
      { nodes, edges, output_node_id: outputNodeId, connection_alias: connectionAlias, dialect }
    ),

  // ─── Chat ─────────────────────────────────────────────────────────────────────
  chat: (messages: { role: string; content: string }[], context?: Record<string, unknown>) =>
    apiClient.post('/api/chat', { messages, context }),

  // ─── Pipelines ────────────────────────────────────────────────────────────────
  listPipelines: () =>
    apiClient.get<{ id: string; name: string; node_count: number; created_at: string; updated_at: string }[]>('/api/pipelines'),
  savePipeline: (payload: { name: string; nodes: unknown[]; edges: unknown[] }) =>
    apiClient.post<{ id: string }>('/api/pipelines', payload),
  updatePipeline: (id: string, payload: { name: string; nodes: unknown[]; edges: unknown[] }) =>
    apiClient.put(`/api/pipelines/${id}`, payload),
  deletePipeline: (id: string) =>
    apiClient.delete(`/api/pipelines/${id}`),
  getPipeline: (id: string) =>
    apiClient.get<{ id: string; name: string; nodes: unknown[]; edges: unknown[] }>(`/api/pipelines/${id}`),
}
