import axios from 'axios'

// With Vite proxy, all /api/* calls go to http://localhost:8000 automatically.
// No CORS issues, no ngrok needed for local dev.
export const apiClient = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
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

  // DuckDB / Schema
  connectDuckDB: (path?: string) => apiClient.post('/api/db/connect', { path }),
  getDbTree: () => apiClient.get('/api/db/tree'),
  preview: (sql: string, limit = 100) => apiClient.post('/api/db/preview', { sql, limit }),
  uploadCSV: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post('/api/db/upload-csv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  generateSQL: (payload: {
    transformation_type: string
    config: Record<string, unknown>
    input_tables: string[]
  }) => apiClient.post('/api/db/generate-sql', payload),

  // Chat
  chat: (messages: { role: string; content: string }[], context?: Record<string, unknown>) =>
    apiClient.post('/api/chat', { messages, context }),
}
