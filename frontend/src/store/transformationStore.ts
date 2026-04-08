import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { current } from 'immer'
import type {
  TransformNode,
  TransformEdge,
  StepHistoryEntry,
  PreviewResult,
  ChatMessage,
  DatabricksConnection,
} from '../types'

type HistorySnapshot = { nodes: TransformNode[]; edges: TransformEdge[] }

const MAX_HISTORY = 50

function snapshot(nodes: TransformNode[], edges: TransformEdge[]): HistorySnapshot {
  return { nodes: [...nodes], edges: [...edges] }
}

interface TransformationState {
  // ─── Connections ───────────────────────────────────────────────
  connections: DatabricksConnection[]
  pipelineConnectionAlias: string | null
  warehouseState: string | null // 'RUNNING'|'STARTING'|'STOPPED'|'STOPPING'|null

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

  // ─── Undo / Redo / Clipboard ────────────────────────────────────
  _history: HistorySnapshot[]
  _future: HistorySnapshot[]
  clipboard: TransformNode[]
}

interface TransformationActions {
  // Connections
  setConnections: (connections: DatabricksConnection[]) => void
  setPipelineConnectionAlias: (alias: string | null) => void
  setWarehouseState: (state: string | null) => void

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
  openEditor: (opts?: {
    id?: string
    name?: string
    nodes?: TransformNode[]
    edges?: TransformEdge[]
  }) => void
  closeEditor: () => void
  clearCanvas: () => void

  // Undo / Redo / Clipboard
  undo: () => void
  redo: () => void
  setClipboard: (nodes: TransformNode[]) => void
  /** Apply multiple canvas mutations as one atomic history entry. */
  batchUpdate: (patch: { nodes?: TransformNode[]; edges?: TransformEdge[] }) => void
}

export const useTransformationStore = create<TransformationState & TransformationActions>()(
  immer((set) => ({
    // ─── Initial State ───────────────────────────────────────────
    connections: [],
    pipelineConnectionAlias: null,
    warehouseState: null,

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

    _history: [],
    _future: [],
    clipboard: [],

    // ─── Actions ──────────────────────────────────────────────────
    setConnections: (connections) =>
      set((s) => {
        s.connections = connections as DatabricksConnection[]
      }),
    setPipelineConnectionAlias: (alias) =>
      set((s) => {
        s.pipelineConnectionAlias = alias
      }),
    setWarehouseState: (state) =>
      set((s) => {
        s.warehouseState = state
      }),

    addNode: (node) =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        s.nodes.push(node)
      }),

    updateNode: (id, updates) =>
      set((s) => {
        const idx = s.nodes.findIndex((n) => n.id === id)
        if (idx !== -1) Object.assign(s.nodes[idx], updates)
        // updateNode is intentionally NOT pushed to history — too granular
      }),

    removeNode: (id) =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        s.nodes = s.nodes.filter((n) => n.id !== id)
        s.edges = s.edges.filter((e) => e.source !== id && e.target !== id)
      }),

    addEdge: (edge) =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        s.edges.push(edge)
      }),

    removeEdge: (id) =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        s.edges = s.edges.filter((e) => e.id !== id)
      }),

    setSelectedNode: (id) =>
      set((s) => {
        s.selectedNodeId = id
      }),

    addStepHistoryEntry: (entry) =>
      set((s) => {
        s.stepHistory.push(entry)
      }),
    updateStepStatus: (id, status) =>
      set((s) => {
        const step = s.stepHistory.find((h) => h.id === id)
        if (step) step.status = status
      }),

    setInputPreview: (preview) =>
      set((s) => {
        s.inputPreview = preview
      }),
    setOutputPreview: (preview) =>
      set((s) => {
        s.outputPreview = preview
      }),
    setPreviewLoading: (loading) =>
      set((s) => {
        s.isPreviewLoading = loading
      }),

    setGeneratedSQL: (sql) =>
      set((s) => {
        s.generatedSQL = sql
      }),

    addChatMessage: (msg) =>
      set((s) => {
        s.chatMessages.push(msg)
      }),
    setChatLoading: (loading) =>
      set((s) => {
        s.isChatLoading = loading
      }),

    setRightPanelTab: (tab) =>
      set((s) => {
        s.rightPanelTab = tab
      }),
    setBottomPanelTab: (tab) =>
      set((s) => {
        s.bottomPanelTab = tab
      }),
    toggleSqlView: () =>
      set((s) => {
        s.isSqlViewExpanded = !s.isSqlViewExpanded
      }),
    setExpandedOutputId: (id) =>
      set((s) => {
        s.expandedOutputId = id
      }),

    setPipelineName: (name) =>
      set((s) => {
        s.pipelineName = name
      }),
    setPipelineId: (id) =>
      set((s) => {
        s.pipelineId = id
      }),

    openEditor: (opts) =>
      set((s) => {
        s.editorOpen = true
        s.pipelineId = opts?.id ?? null
        s.pipelineName = opts?.name ?? 'Untitled Pipeline'
        s.nodes = opts?.nodes ?? []
        s.edges = opts?.edges ?? []
        s.selectedNodeId = null
        s.generatedSQL = ''
        s.outputPreview = null
        s.expandedOutputId = null
        s.pipelineConnectionAlias = null
        s.warehouseState = null
        // Clear history when opening a new pipeline
        s._history = []
        s._future = []
      }),

    closeEditor: () =>
      set((s) => {
        s.editorOpen = false
        s.expandedOutputId = null
      }),

    clearCanvas: () =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        s.nodes = []
        s.edges = []
        s.selectedNodeId = null
        s.generatedSQL = ''
        s.outputPreview = null
        s.pipelineConnectionAlias = null
        s.warehouseState = null
      }),

    // ─── Undo / Redo ─────────────────────────────────────────────
    undo: () =>
      set((s) => {
        const prev = s._history[s._history.length - 1]
        if (!prev) return
        s._future.push(
          snapshot(current(s.nodes) as TransformNode[], current(s.edges) as TransformEdge[])
        )
        s._history.pop()
        s.nodes = prev.nodes as TransformNode[]
        s.edges = prev.edges as TransformEdge[]
        s.selectedNodeId = null
      }),

    redo: () =>
      set((s) => {
        const next = s._future[s._future.length - 1]
        if (!next) return
        s._history.push(
          snapshot(current(s.nodes) as TransformNode[], current(s.edges) as TransformEdge[])
        )
        s._future.pop()
        s.nodes = next.nodes as TransformNode[]
        s.edges = next.edges as TransformEdge[]
        s.selectedNodeId = null
      }),

    setClipboard: (nodes) =>
      set((s) => {
        s.clipboard = nodes
      }),

    batchUpdate: (patch) =>
      set((s) => {
        const snap = snapshot(
          current(s.nodes) as TransformNode[],
          current(s.edges) as TransformEdge[]
        )
        s._history.push(snap)
        if (s._history.length > MAX_HISTORY) s._history.shift()
        s._future = []
        if (patch.nodes !== undefined) s.nodes = patch.nodes as TransformNode[]
        if (patch.edges !== undefined) s.edges = patch.edges as TransformEdge[]
      }),
  }))
)
