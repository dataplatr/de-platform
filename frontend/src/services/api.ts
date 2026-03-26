import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ─── Request interceptor: attach auth token ───────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response interceptor: unified error handling ─────────────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── API helpers ──────────────────────────────────────────────────────────────

export const api = {
  // Health
  health: () => apiClient.get<{ status: string }>('/health'),

  // Connection
  connectDuckDB: () => apiClient.post('/api/connection/duckdb'),

  // Schema browser
  getDatabases: () => apiClient.get<{ databases: string[] }>('/api/schema/databases'),
  getSchemas: (db: string) => apiClient.get<{ schemas: string[] }>(`/api/schema/${db}/schemas`),
  getTables: (db: string, schema: string) =>
    apiClient.get<{ tables: { name: string; rowCount?: number }[] }>(`/api/schema/${db}/${schema}/tables`),
  getTableSchema: (db: string, schema: string, table: string) =>
    apiClient.get(`/api/schema/${db}/${schema}/${table}`),

  // Preview
  preview: (payload: { sql: string; limit?: number }) =>
    apiClient.post('/api/preview', payload),

  // CSV upload
  uploadCSV: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post('/api/upload/csv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  // SQL generation
  generateSQL: (nodes: unknown[], edges: unknown[]) =>
    apiClient.post('/api/sql/generate', { nodes, edges }),

  // Chat / AI
  chat: (payload: { message: string; schemaContext: unknown; history: unknown[] }) =>
    apiClient.post('/api/chat', payload),

  // Transformations (CRUD)
  listTransformations: () => apiClient.get('/api/transformations'),
  getTransformation: (id: string) => apiClient.get(`/api/transformations/${id}`),
  saveTransformation: (payload: unknown) => apiClient.post('/api/transformations', payload),
  updateTransformation: (id: string, payload: unknown) => apiClient.put(`/api/transformations/${id}`, payload),
  deleteTransformation: (id: string) => apiClient.delete(`/api/transformations/${id}`),

  // Execute
  executeTransformation: (id: string) => apiClient.post(`/api/transformations/${id}/execute`),
}
