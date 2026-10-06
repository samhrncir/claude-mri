// Single zustand store: snapshot + indexes, graph view state, interaction state, filters, UI prefs.
import { applyNodeChanges, type NodeChange } from '@xyflow/react'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { LAYERS, type Layer, type NodeKind } from '../../shared/kinds.js'
import type { Snapshot } from '../../shared/snapshot.js'
import { buildIndexes } from '../graph/buildGraph.js'
import { neighborhood } from '../graph/collapse.js'
import { layoutKey, loadPersisted, savePersisted } from '../lib/persist.js'
import type { Filters, GraphEdge, GraphNode, Highlight, Indexes, LaneBox, Mode, Status } from './types.js'

export interface ToastItem {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export interface AppState {
  status: Status
  mode: Mode
  error?: string
  scanProgress?: { phase: string; done: number; total: number }
  snapshot: Snapshot | null
  indexes: Indexes | null
  persistKey: string | null

  expanded: Record<string, boolean>
  positions: Record<string, { x: number; y: number }>
  groupQuery: Record<string, string>
  rfNodes: GraphNode[]
  rfEdges: GraphEdge[]
  lanes: LaneBox[]
  layoutStatus: 'idle' | 'running' | 'elk' | 'fallback'
  layoutGeneration: number
  pendingFit: boolean
  flyTo: string | null

  selectedId: string | null
  hoverId: string | null
  highlight: Highlight | null
  focus: { rootId: string; hops: 1 | 2 | 3 } | null

  filters: Filters
  searchOpen: boolean
  tour: { step: number } | null
  legendOpen: boolean
  railOpen: boolean
  inspectorWidth: number
  scrollMode: 'zoom' | 'pan'
  toasts: ToastItem[]

  loadSnapshot(snapshot: Snapshot, mode: Mode): void
  setStatus(status: Status, error?: string): void
  setScanProgress(p: AppState['scanProgress']): void
  toggleExpanded(id: string, value?: boolean): void
  expandAll(): void
  collapseAll(): void
  setGroupQuery(id: string, query: string): void
  setLayout(nodes: GraphNode[], edges: GraphEdge[], lanes: LaneBox[], engine: 'elk' | 'fallback', generation: number): void
  setLayoutRunning(generation: number): void
  onNodesChange(changes: NodeChange<GraphNode>[]): void
  pin(id: string, position: { x: number; y: number }): void
  resetLayout(): void
  consumeFit(): void
  select(id: string | null): void
  hover(id: string | null): void
  setFocus(rootId: string | null, hops?: 1 | 2 | 3): void
  revealNode(id: string): void
  consumeFly(): void
  setFilters(patch: Partial<Filters>): void
  toggleLayer(layer: Layer): void
  toggleKind(kind: NodeKind): void
  setSearchOpen(open: boolean): void
  startTour(): void
  tourStep(delta: 1 | -1): void
  endTour(): void
  setLegendOpen(open: boolean): void
  setRailOpen(open: boolean): void
  setInspectorWidth(width: number): void
  setScrollMode(mode: 'zoom' | 'pan'): void
  toast(text: string, action?: ToastItem['action']): void
  dismissToast(id: number): void
}

let toastSeq = 0

export const defaultFilters = (): Filters => ({ layers: new Set<Layer>(['config']), hiddenKinds: new Set(), problemsOnly: false, tokenView: false })

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    status: 'idle',
    mode: 'local',
    snapshot: null,
    indexes: null,
    persistKey: null,
    expanded: {},
    positions: {},
    groupQuery: {},
    rfNodes: [],
    rfEdges: [],
    lanes: [],
    layoutStatus: 'idle',
    layoutGeneration: 0,
    pendingFit: false,
    flyTo: null,
    selectedId: null,
    hoverId: null,
    highlight: null,
    focus: null,
    filters: defaultFilters(),
    searchOpen: false,
    tour: null,
    legendOpen: false,
    railOpen: true,
    inspectorWidth: 400,
    scrollMode: 'zoom',
    toasts: [],

    loadSnapshot(snapshot, mode) {
      const indexes = buildIndexes(snapshot)
      const key = layoutKey(snapshot.meta.platform, snapshot.meta.homeDir)
      const persisted = mode === 'local' ? loadPersisted(key) : null
      set({
        snapshot,
        indexes,
        mode,
        status: snapshot.nodes.length < 3 ? 'empty' : 'ready',
        persistKey: key,
        expanded: persisted?.expanded ?? {},
        positions: persisted?.positions ?? {},
        groupQuery: {},
        selectedId: null,
        hoverId: null,
        highlight: null,
        focus: null,
        pendingFit: true,
        error: undefined,
      })
    },
    setStatus: (status, error) => set({ status, error }),
    setScanProgress: (scanProgress) => set({ scanProgress }),

    toggleExpanded(id, value) {
      const s = get()
      const current = s.expanded[id] ?? !s.rfNodes.find((n) => n.id === id)?.data.collapsed
      const next = { ...s.expanded, [id]: value ?? !current }
      set({ expanded: next })
      persist(get())
    },
    expandAll() {
      const s = get()
      const next: Record<string, boolean> = {}
      for (const n of s.rfNodes) if (n.data.isContainer) next[n.id] = true
      for (const n of s.snapshot?.nodes ?? []) if (s.indexes?.childrenOf.has(n.id)) next[n.id] = true
      set({ expanded: next })
      persist(get())
    },
    collapseAll() {
      const s = get()
      const next: Record<string, boolean> = {}
      for (const id of s.indexes?.topLevel ?? []) next[id] = false
      set({ expanded: next })
      persist(get())
    },
    setGroupQuery: (id, query) => set((s) => ({ groupQuery: { ...s.groupQuery, [id]: query } })),

    setLayout(nodes, edges, lanes, engine, generation) {
      if (generation !== get().layoutGeneration) return
      set({ rfNodes: nodes, rfEdges: edges, lanes, layoutStatus: engine })
    },
    setLayoutRunning: (generation) => set({ layoutStatus: 'running', layoutGeneration: generation }),
    onNodesChange(changes) {
      const relevant = changes.filter((c) => c.type === 'position' || c.type === 'select' || c.type === 'dimensions')
      if (relevant.length === 0) return
      set((s) => ({ rfNodes: applyNodeChanges(relevant, s.rfNodes) as GraphNode[] }))
    },
    pin(id, position) {
      set((s) => ({ positions: { ...s.positions, [id]: position } }))
      persist(get())
    },
    resetLayout() {
      set({ positions: {}, expanded: {}, pendingFit: true })
      persist(get())
    },
    consumeFit: () => set({ pendingFit: false }),

    select(id) {
      set({ selectedId: id })
      if (id === null && get().focus) set({ focus: null, highlight: null })
    },
    hover(id) {
      const s = get()
      if (s.focus) return
      if (id === null) {
        set({ hoverId: null, highlight: null })
        return
      }
      const parentOf = (x: string) => s.rfNodes.find((n) => n.id === x)?.parentId
      set({ hoverId: id, highlight: neighborhood(id, s.rfEdges, 1, parentOf) })
    },
    setFocus(rootId, hops = 1) {
      if (!rootId) {
        set({ focus: null, highlight: null })
        return
      }
      const s = get()
      const parentOf = (x: string) => s.rfNodes.find((n) => n.id === x)?.parentId
      set({ focus: { rootId, hops }, highlight: neighborhood(rootId, s.rfEdges, hops, parentOf), selectedId: rootId })
    },
    revealNode(id) {
      const s = get()
      if (!s.indexes) return
      const next = { ...s.expanded }
      let p = s.indexes.parentOf.get(id)
      while (p) {
        if (s.indexes.byId.get(p)?.kind !== 'machine') next[p] = true
        p = s.indexes.parentOf.get(p)
      }
      // Sections stand in for groups of children; open the section that would hold this node.
      const node = s.indexes.byId.get(id)
      if (node?.parentId) next[`ui:section:${node.parentId}:${node.kind}`] = true
      set({ selectedId: id, flyTo: id, expanded: next })
      persist(get())
    },
    consumeFly: () => set({ flyTo: null }),

    setFilters(patch) {
      set((s) => ({ filters: { ...s.filters, ...patch } }))
    },
    toggleLayer(layer) {
      set((s) => {
        const layers = new Set(s.filters.layers)
        if (layers.has(layer)) layers.delete(layer)
        else layers.add(layer)
        if (layers.size === 0) layers.add('config')
        return { filters: { ...s.filters, layers } }
      })
    },
    toggleKind(kind) {
      set((s) => {
        const hiddenKinds = new Set(s.filters.hiddenKinds)
        if (hiddenKinds.has(kind)) hiddenKinds.delete(kind)
        else hiddenKinds.add(kind)
        return { filters: { ...s.filters, hiddenKinds } }
      })
    },
    setSearchOpen: (searchOpen) => set({ searchOpen }),
    startTour: () => set({ tour: { step: 0 }, focus: null, highlight: null, selectedId: null }),
    tourStep: (delta) => set((s) => (s.tour ? { tour: { step: Math.max(0, s.tour.step + delta) } } : {})),
    endTour: () => set({ tour: null, highlight: null }),
    setLegendOpen: (legendOpen) => set({ legendOpen }),
    setRailOpen: (railOpen) => set({ railOpen }),
    setInspectorWidth: (inspectorWidth) => set({ inspectorWidth: Math.min(720, Math.max(320, inspectorWidth)) }),
    setScrollMode: (scrollMode) => set({ scrollMode }),
    toast(text, action) {
      if (get().toasts.some((t) => t.text === text)) return
      toastSeq += 1
      const id = toastSeq
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, action }] }))
      if (!action) setTimeout(() => get().dismissToast(id), 6000)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  })),
)

function persist(s: AppState): void {
  if (!s.persistKey || s.mode !== 'local') return
  savePersisted(s.persistKey, { positions: s.positions, expanded: s.expanded })
}

export const ALL_LAYERS = LAYERS
