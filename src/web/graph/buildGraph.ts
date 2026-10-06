// Snapshot -> React Flow nodes and edges, honouring filters, collapse state and section grouping.
import { MarkerType } from '@xyflow/react'
import { EDGE_FAMILY, KIND_FAMILY, isContainerKind, type EdgeKind, type Layer, type NodeKind } from '../../shared/kinds.js'
import type { Edge, Node, Snapshot } from '../../shared/snapshot.js'
import type { Filters, GraphEdge, GraphNode, Indexes, RFNodeData } from '../store/types.js'
import { EDGE_STYLE, familyColor, isDrawn } from './edges.js'
import { COLLAPSED, leafSize, nodeTypeFor } from './sizes.js'

export const HUGE_SNAPSHOT = 3000
const SECTION_MIN_CHILDREN = 12
const SECTION_MIN_PER_KIND = 3

export interface BuildInput {
  snapshot: Snapshot
  indexes: Indexes
  filters: Filters
  expanded: Record<string, boolean>
  groupQuery: Record<string, string>
}

export interface BuildResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** snapshot node id -> rendered RF node id (itself, or the collapsed ancestor / section that stands for it). */
  representative: Map<string, string>
  containerIds: Set<string>
}

export function buildIndexes(snapshot: Snapshot): Indexes {
  const byId = new Map<string, Node>()
  const childrenOf = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  const edgesBySource = new Map<string, Edge[]>()
  const edgesByTarget = new Map<string, Edge[]>()
  const warningsByNode = new Map<string, import('../../shared/snapshot.js').Warning[]>()
  const countsByKind: Partial<Record<NodeKind, number>> = {}
  for (const n of snapshot.nodes) {
    byId.set(n.id, n)
    countsByKind[n.kind] = (countsByKind[n.kind] ?? 0) + 1
    if (n.parentId) {
      parentOf.set(n.id, n.parentId)
      childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n.id])
    }
  }
  for (const e of snapshot.edges) {
    if (e.kind === 'contains') continue
    edgesBySource.set(e.source, [...(edgesBySource.get(e.source) ?? []), e])
    edgesByTarget.set(e.target, [...(edgesByTarget.get(e.target) ?? []), e])
  }
  for (const w of snapshot.warnings) if (w.nodeId) warningsByNode.set(w.nodeId, [...(warningsByNode.get(w.nodeId) ?? []), w])
  const machine = snapshot.nodes.find((n) => n.kind === 'machine')
  const topLevel = machine ? (childrenOf.get(machine.id) ?? []) : snapshot.nodes.filter((n) => !n.parentId).map((n) => n.id)
  return { byId, childrenOf, parentOf, edgesBySource, edgesByTarget, warningsByNode, topLevel, countsByKind }
}

export function hasProblem(n: Node, indexes: Indexes): boolean {
  return Boolean(n.flags?.some((f) => f === 'broken' || f === 'missing' || f === 'ghost')) || indexes.warningsByNode.has(n.id)
}

const PARTITION: Partial<Record<NodeKind, number>> = {
  managedScope: 0,
  userScope: 1,
  project: 2,
  pluginRegistry: 3,
  cloudConnectors: 3,
  claudeDesktop: 3,
  toolset: 4,
}

export function partitionOf(kind: NodeKind): number {
  return PARTITION[kind] ?? 3
}

/** Default open/closed state of a container before the user touches it. */
export function defaultExpanded(n: Node, childCount: number, ctx: { projectCount: number; mostRecentProject?: string; huge: boolean }): boolean {
  if (ctx.huge) return false
  switch (n.kind) {
    case 'userScope':
    case 'managedScope':
    case 'toolset':
      return true
    case 'project':
      return ctx.projectCount <= 3 || n.id === ctx.mostRecentProject
    case 'plugin':
      return childCount <= 20
    case 'hookGroup':
      return childCount <= 8
    default:
      return childCount <= 12
  }
}

export function buildGraph(input: BuildInput): BuildResult {
  const { snapshot, indexes, filters, expanded, groupQuery } = input
  const huge = snapshot.nodes.length > HUGE_SNAPSHOT
  const projects = snapshot.nodes.filter((n) => n.kind === 'project')
  const mostRecentProject = projects.slice().sort((a, b) => (b.stats?.lastSessionAt ?? '').localeCompare(a.stats?.lastSessionAt ?? ''))[0]?.id
  const ctx = { projectCount: projects.length, mostRecentProject, huge }

  // 1. Visibility by layer / kind / problems, propagated up to ancestors.
  const passes = (n: Node): boolean => filters.layers.has(n.layer as Layer) && !filters.hiddenKinds.has(n.kind) && (!filters.problemsOnly || hasProblem(n, indexes))
  const visible = new Set<string>()
  const visit = (id: string): boolean => {
    const n = indexes.byId.get(id)
    if (!n) return false
    const kids = indexes.childrenOf.get(id) ?? []
    let anyChild = false
    for (const k of kids) if (visit(k)) anyChild = true
    const self = passes(n)
    const isContainer = isContainerKind(n.kind) || kids.length > 0
    const show = self || (isContainer && anyChild && !filters.hiddenKinds.has(n.kind))
    if (show) visible.add(id)
    return show
  }
  for (const id of indexes.topLevel) visit(id)

  const nodes: GraphNode[] = []
  const representative = new Map<string, string>()
  const containerIds = new Set<string>()
  const tokenMax = Math.max(1, ...snapshot.nodes.map((n) => n.stats?.tokensAlwaysOn ?? 0).filter((v) => v < 10_000))

  const dataFor = (n: Node, extra: Partial<RFNodeData>, partition: number): RFNodeData => ({
    nodeId: n.id,
    kind: n.kind,
    label: n.label,
    summary: n.summary,
    family: KIND_FAMILY[n.kind],
    scope: n.scope,
    loadTiming: n.loadTiming,
    flags: n.flags ?? [],
    hasProblem: hasProblem(n, indexes),
    isContainer: false,
    collapsed: false,
    childCount: 0,
    counts: [],
    stats: n.stats,
    invocation: (n.data as { invocation?: string }).invocation,
    ruleEffect: n.kind === 'permissionRule' ? (n.data as { list?: 'allow' | 'deny' | 'ask' }).list : undefined,
    tokenShare: filters.tokenView && n.stats?.tokensAlwaysOn !== undefined ? Math.min(1, n.stats.tokensAlwaysOn / tokenMax) : undefined,
    partition,
    ...extra,
  })

  const descendantCounts = (id: string): { kind: string; n: number }[] => {
    const counts = new Map<string, number>()
    const walk = (x: string) => {
      for (const k of indexes.childrenOf.get(x) ?? []) {
        if (!visible.has(k)) continue
        const kn = indexes.byId.get(k)
        if (!kn) continue
        if (!isContainerKind(kn.kind) || kn.kind === 'worktree') counts.set(kn.kind, (counts.get(kn.kind) ?? 0) + 1)
        walk(k)
      }
    }
    walk(id)
    return Array.from(counts.entries())
      .map(([kind, n]) => ({ kind, n }))
      .sort((a, b) => b.n - a.n)
  }

  const markCollapsed = (rootId: string, repId: string) => {
    for (const k of indexes.childrenOf.get(rootId) ?? []) {
      representative.set(k, repId)
      markCollapsed(k, repId)
    }
  }

  const emitLeaf = (n: Node, parentRf: string | undefined, partition: number) => {
    const size = leafSize(n.kind)
    nodes.push({ id: n.id, type: nodeTypeFor(n.kind), position: { x: 0, y: 0 }, parentId: parentRf, extent: parentRf ? 'parent' : undefined, width: size.width, height: size.height, draggable: parentRf === undefined, data: dataFor(n, {}, partition) })
    representative.set(n.id, n.id)
  }

  const emitChildren = (ownerId: string, parentRf: string, kids: Node[], partition: number) => {
    const query = (groupQuery[ownerId] ?? '').trim().toLowerCase()
    const filtered = query === '' ? kids : kids.filter((k) => k.label.toLowerCase().includes(query) || (k.data as { invocation?: string }).invocation?.toLowerCase().includes(query))
    const byKind = new Map<NodeKind, Node[]>()
    for (const k of filtered) byKind.set(k.kind, [...(byKind.get(k.kind) ?? []), k])
    const useSections = filtered.length > SECTION_MIN_CHILDREN && byKind.size >= 2
    for (const [kind, group] of byKind) {
      if (useSections && group.length >= SECTION_MIN_PER_KIND) {
        const sectionId = `ui:section:${ownerId}:${kind}`
        const open = expanded[sectionId] ?? group.length <= 40
        const sectionData: RFNodeData = {
          nodeId: sectionId,
          kind: 'section',
          sectionKind: kind,
          label: `${titleOf(kind)} (${group.length})`,
          summary: `${group.length} ${titleOf(kind).toLowerCase()} inside ${indexes.byId.get(ownerId)?.label ?? ''}`,
          family: KIND_FAMILY[kind],
          scope: indexes.byId.get(ownerId)?.scope ?? 'machine',
          flags: [],
          hasProblem: group.some((g) => hasProblem(g, indexes)),
          isContainer: true,
          collapsed: !open,
          childCount: group.length,
          counts: [{ kind, n: group.length }],
          partition,
        }
        if (!open) {
          nodes.push({ id: sectionId, type: 'collapsed', position: { x: 0, y: 0 }, parentId: parentRf, extent: 'parent', width: COLLAPSED.width, height: COLLAPSED.height, draggable: false, data: sectionData })
          for (const g of group) {
            representative.set(g.id, sectionId)
            markCollapsed(g.id, sectionId)
          }
          continue
        }
        containerIds.add(sectionId)
        nodes.push({ id: sectionId, type: 'container', position: { x: 0, y: 0 }, parentId: parentRf, extent: 'parent', draggable: false, data: sectionData })
        for (const g of group) emitNode(g, sectionId, partition)
        continue
      }
      for (const g of group) emitNode(g, parentRf, partition)
    }
  }

  const emitNode = (n: Node, parentRf: string | undefined, partition: number) => {
    const kids = (indexes.childrenOf.get(n.id) ?? []).map((k) => indexes.byId.get(k)).filter((k): k is Node => Boolean(k) && visible.has((k as Node).id))
    const isContainer = isContainerKind(n.kind) || kids.length > 0
    if (!isContainer) {
      emitLeaf(n, parentRf, partition)
      return
    }
    const open = expanded[n.id] ?? defaultExpanded(n, kids.length, ctx)
    const counts = descendantCounts(n.id)
    const base = dataFor(n, { isContainer: true, collapsed: !open, childCount: kids.length, counts }, partition)
    if (!open || kids.length === 0) {
      nodes.push({ id: n.id, type: 'collapsed', position: { x: 0, y: 0 }, parentId: parentRf, extent: parentRf ? 'parent' : undefined, width: COLLAPSED.width, height: COLLAPSED.height, draggable: parentRf === undefined, data: base })
      representative.set(n.id, n.id)
      markCollapsed(n.id, n.id)
      return
    }
    containerIds.add(n.id)
    nodes.push({ id: n.id, type: 'container', position: { x: 0, y: 0 }, parentId: parentRf, extent: parentRf ? 'parent' : undefined, draggable: parentRf === undefined, data: base })
    representative.set(n.id, n.id)
    emitChildren(n.id, n.id, kids, partition)
  }

  const order = (a: Node, b: Node) => partitionOf(a.kind) - partitionOf(b.kind) || topOrder(a, b)
  const topNodes = indexes.topLevel.map((id) => indexes.byId.get(id)).filter((n): n is Node => Boolean(n) && visible.has((n as Node).id)).sort(order)
  for (const n of topNodes) emitNode(n, undefined, partitionOf(n.kind))

  // 2. Edges: re-target to the rendered representative, drop implied kinds, aggregate duplicates.
  const rendered = new Set(nodes.map((n) => n.id))
  const repOf = (id: string): string | undefined => {
    let cur: string | undefined = id
    while (cur) {
      const rep = representative.get(cur)
      if (rep && rendered.has(rep)) return rep
      cur = indexes.parentOf.get(cur)
    }
    return undefined
  }
  const agg = new Map<string, GraphEdge>()
  for (const e of snapshot.edges) {
    if (!isDrawn(e.kind)) continue
    const style = EDGE_STYLE[e.kind]
    if (style.layerOnly && !filters.layers.has(style.layerOnly)) continue
    const s = repOf(e.source)
    const t = repOf(e.target)
    if (!s || !t || s === t) continue
    const key = `${e.kind}|${s}|${t}`
    const existing = agg.get(key)
    if (existing) {
      existing.data!.count += 1
      existing.data!.memberIds.push(e.id)
      existing.data!.kind = 'aggregated'
      existing.data!.label = `${labelOf(e.kind)} ×${existing.data!.count}`
      continue
    }
    const family = EDGE_FAMILY[e.kind]
    agg.set(key, {
      id: `rf:${key}`,
      source: s,
      target: t,
      type: 'kind',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: familyColor(family) },
      data: { kind: e.kind, baseKind: e.kind, family, label: e.label ?? labelOf(e.kind), count: 1, memberIds: [e.id], stroke: style.stroke, animated: style.animated },
    })
  }
  return { nodes, edges: Array.from(agg.values()), representative, containerIds }
}

function topOrder(a: Node, b: Node): number {
  if (a.kind === 'project' && b.kind === 'project') return (b.stats?.lastSessionAt ?? '').localeCompare(a.stats?.lastSessionAt ?? '') || a.label.localeCompare(b.label)
  return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)
}

const EDGE_LABEL: Record<EdgeKind, string> = {
  contains: 'contains',
  provides: 'provides',
  loadsAtStartup: 'loads at startup',
  loadsLazily: 'loads on demand',
  imports: 'imports',
  overrides: 'overrides',
  enables: 'enables',
  disables: 'disables',
  configures: 'configures',
  triggers: 'triggers',
  matches: 'runs for',
  allows: 'allows',
  denies: 'denies',
  asks: 'asks',
  approves: 'approves',
  rejects: 'rejects',
  surfacesAs: 'appears as',
  installedFrom: 'installed from',
  references: 'references',
  recordsUsage: 'usage',
  remembers: 'remembers',
  runsIn: 'running in',
  writes: 'writes',
  holds: 'uses',
  nestedIn: 'inside',
  sameProjectAs: 'same project',
}

export function labelOf(kind: EdgeKind): string {
  return EDGE_LABEL[kind]
}

export function titleOf(kind: NodeKind): string {
  const TITLES: Partial<Record<NodeKind, string>> = {
    skill: 'Skills',
    command: 'Commands',
    agent: 'Agents',
    hookGroup: 'Hook groups',
    hook: 'Hooks',
    hookEvent: 'Hook events',
    tool: 'Tools',
    permissionRule: 'Permission rules',
    mcpServer: 'MCP servers',
    session: 'Sessions',
    memoryFile: 'Memory notes',
    plan: 'Plans',
    stateDir: 'State folders',
    logFile: 'Logs',
    connector: 'Connectors',
    claudeMd: 'CLAUDE.md files',
    rulesFile: 'Rules',
    settings: 'Settings files',
    unknownMcpServer: 'Unknown servers',
    liveSession: 'Running sessions',
    marketplace: 'Marketplaces',
    plugin: 'Plugins',
    outputStyle: 'Output styles',
    lspServer: 'Language servers',
    memoryIndex: 'Memory indexes',
    importedDoc: 'Imported docs',
    projectState: 'Project state',
    worktree: 'Worktrees',
  }
  return TITLES[kind] ?? kind
}
