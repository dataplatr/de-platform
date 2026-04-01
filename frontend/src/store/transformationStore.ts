import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  TransformNode,
  TransformEdge,
  StepHistoryEntry,
  PreviewResult,
  ChatMessage,
  DatabaseTree,
  CSVSource,
  TableSchema,
} from '../types'

interface TransformationState {
  // ─── Data Sources ──────────────────────────────────────────────
  databaseTree: DatabaseTree[]
  csvSources: CSVSource[]
  selectedTableSchema: TableSchema | null
  isConnected: boolean

  // ─── Canvas ────────────────────────────────────────────────────
  nodes: TransformNode[]
  edges: TransformEdge[]
  selectedNodeId: string | null

  // ─── Step History ──────────────────────────────────────────────
  stepHistory: StepHistoryEntry[]

  // ─── Preview ───────────────────────────────────────────────────
  inputPreview: PreviewResult | null
  outputPreview: PreviewResult | null
  isPreviewLoading: boolean

  // ─── SQL ───────────────────────────────────────────────────────
  generatedSQL: string

  // ─── Chat ──────────────────────────────────────────────────────
  chatMessages: ChatMessage[]
  isChatLoading: boolean

  // ─── UI State ──────────────────────────────────────────────────
  rightPanelTab: 'history' | 'config'
  bottomPanelTab: 'input' | 'output'
  isSqlViewExpanded: boolean
  expandedOutputId: string | null

  // ─── Pipeline ──────────────────────────────────────────────────
  pipelineName: string
  pipelineId: string | null
  editorOpen: boolean
}

interface TransformationActions {
  // Connection
  setConnected: (connected: boolean) => void
  setDatabaseTree: (tree: DatabaseTree[]) => void
  addCsvSource: (csv: CSVSource) => void
  setSelectedTableSchema: (schema: TableSchema | null) => void

  // Canvas
  addNode: (node: TransformNode) => void
  updateNode: (id: string, updates: Partial<TransformNode>) => void
  removeNode: (id: string) => void
  addEdge: (edge: TransformEdge) => void
  removeEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void

  // Step History
  addStepHistoryEntry: (entry: StepHistoryEntry) => void
  updateStepStatus: (id: string, status: StepHistoryEntry['status']) => void

  // Preview
  setInputPreview: (preview: PreviewResult | null) => void
  setOutputPreview: (preview: PreviewResult | null) => void
  setPreviewLoading: (loading: boolean) => void

  // SQL
  setGeneratedSQL: (sql: string) => void

  // Chat
  addChatMessage: (msg: ChatMessage) => void
  setChatLoading: (loading: boolean) => void

  // UI
  setRightPanelTab: (tab: 'history' | 'config') => void
  setBottomPanelTab: (tab: 'input' | 'output') => void
  toggleSqlView: () => void
  setExpandedOutputId: (id: string | null) => void

  // Pipeline
  setPipelineName: (name: string) => void
  setPipelineId: (id: string | null) => void
  openEditor: (opts?: { id?: string; name?: string; nodes?: TransformNode[]; edges?: TransformEdge[] }) => void
  closeEditor: () => void
  clearCanvas: () => void
}

export const useTransformationStore = create<TransformationState & TransformationActions>()(
  immer((set) => ({
    // ─── Initial State ───────────────────────────────────────────
    databaseTree: [],
    csvSources: [],
    selectedTableSchema: null,
    isConnected: false,

    nodes: [],
    edges: [],
    selectedNodeId: null,

    stepHistory: [],

    inputPreview: null,
    outputPreview: null,
    isPreviewLoading: false,

    generatedSQL: '',

    chatMessages: [],
    isChatLoading: false,

    rightPanelTab: 'history',
    bottomPanelTab: 'output',
    isSqlViewExpanded: false,
    expandedOutputId: null,

    pipelineName: 'Untitled Pipeline',
    pipelineId: null,
    editorOpen: false,

    // ─── Actions ──────────────────────────────────────────────────
    setConnected: (connected) => set((s) => { s.isConnected = connected }),
    setDatabaseTree: (tree) => set((s) => { s.databaseTree = tree }),
    addCsvSource: (csv) => set((s) => { s.csvSources.push(csv) }),
    setSelectedTableSchema: (schema) => set((s) => { s.selectedTableSchema = schema }),

    addNode: (node) => set((s) => { s.nodes.push(node) }),
    updateNode: (id, updates) => set((s) => {
      const idx = s.nodes.findIndex((n) => n.id === id)
      if (idx !== -1) Object.assign(s.nodes[idx], updates)
    }),
    removeNode: (id) => set((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== id)
      s.edges = s.edges.filter((e) => e.source !== id && e.target !== id)
    }),
    addEdge: (edge) => set((s) => { s.edges.push(edge) }),
    removeEdge: (id) => set((s) => { s.edges = s.edges.filter((e) => e.id !== id) }),
    setSelectedNode: (id) => set((s) => { s.selectedNodeId = id }),

    addStepHistoryEntry: (entry) => set((s) => { s.stepHistory.push(entry) }),
    updateStepStatus: (id, status) => set((s) => {
      const step = s.stepHistory.find((h) => h.id === id)
      if (step) step.status = status
    }),

    setInputPreview: (preview) => set((s) => { s.inputPreview = preview }),
    setOutputPreview: (preview) => set((s) => { s.outputPreview = preview }),
    setPreviewLoading: (loading) => set((s) => { s.isPreviewLoading = loading }),

    setGeneratedSQL: (sql) => set((s) => { s.generatedSQL = sql }),

    addChatMessage: (msg) => set((s) => { s.chatMessages.push(msg) }),
    setChatLoading: (loading) => set((s) => { s.isChatLoading = loading }),

    setRightPanelTab: (tab) => set((s) => { s.rightPanelTab = tab }),
    setBottomPanelTab: (tab) => set((s) => { s.bottomPanelTab = tab }),
    toggleSqlView: () => set((s) => { s.isSqlViewExpanded = !s.isSqlViewExpanded }),
    setExpandedOutputId: (id) => set((s) => { s.expandedOutputId = id }),

    setPipelineName: (name) => set((s) => { s.pipelineName = name }),
    setPipelineId: (id) => set((s) => { s.pipelineId = id }),
    openEditor: (opts) => set((s) => {
      s.editorOpen = true
      s.pipelineId   = opts?.id   ?? null
      s.pipelineName = opts?.name ?? 'Untitled Pipeline'
      s.nodes        = opts?.nodes ?? []
      s.edges        = opts?.edges ?? []
      s.selectedNodeId   = null
      s.generatedSQL     = ''
      s.outputPreview    = null
      s.expandedOutputId = null
    }),
    closeEditor: () => set((s) => { s.editorOpen = false; s.expandedOutputId = null }),
    clearCanvas: () => set((s) => {
      s.nodes = []; s.edges = []; s.selectedNodeId = null
      s.generatedSQL = ''; s.outputPreview = null
    }),
  }))
)
