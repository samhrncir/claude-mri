// Accumulates nodes, edges, files and warnings during a scan and produces a deterministic snapshot.
import { isContainerKind, type EdgeKind, type LoadTiming, type NodeKind } from '../../shared/kinds.js'
import { SCHEMA_VERSION, type Edge, type FileEntry, type Meta, type Node, type Snapshot, type Warning } from '../../shared/snapshot.js'

export type EdgeInput = Omit<Edge, 'id'> & { id?: string }

export class GraphBuilder {
  private readonly nodes = new Map<string, Node>()
  private readonly edges = new Map<string, Edge>()
  readonly files: Record<string, FileEntry> = {}
  readonly warnings: Warning[] = []

  has(id: string): boolean {
    return this.nodes.has(id)
  }

  get(id: string): Node | undefined {
    return this.nodes.get(id)
  }

  /** Adds a node; an existing node with the same id is kept and returned unchanged. */
  node<K extends NodeKind>(n: Node<K>): Node<K> {
    const existing = this.nodes.get(n.id)
    if (existing) return existing as Node<K>
    this.nodes.set(n.id, n)
    return n
  }

  mergeNode(id: string, patch: Partial<Omit<Node, 'id' | 'kind'>>): Node | undefined {
    const existing = this.nodes.get(id)
    if (!existing) return undefined
    const merged: Node = {
      ...existing,
      ...patch,
      data: patch.data ? { ...existing.data, ...patch.data } : existing.data,
      stats: patch.stats ? { ...existing.stats, ...patch.stats } : existing.stats,
      flags: patch.flags ? Array.from(new Set([...(existing.flags ?? []), ...patch.flags])) : existing.flags,
    }
    this.nodes.set(id, merged)
    return merged
  }

  addFlag(id: string, flag: NonNullable<Node['flags']>[number]): void {
    this.mergeNode(id, { flags: [flag] })
  }

  edge(e: EdgeInput): Edge {
    const id = e.id ?? `${e.kind}:${e.source}->${e.target}`
    const existing = this.edges.get(id)
    if (existing) {
      if (e.data) existing.data = { ...existing.data, ...e.data }
      return existing
    }
    const edge: Edge = { ...e, id }
    this.edges.set(id, edge)
    return edge
  }

  file(entry: FileEntry): FileEntry {
    this.files[entry.id] = entry
    return entry
  }

  warn(w: Warning): void {
    this.warnings.push(w)
  }

  byKind<K extends NodeKind>(kind: K): Node<K>[] {
    const out: Node<K>[] = []
    for (const n of this.nodes.values()) if (n.kind === kind) out.push(n as Node<K>)
    return out
  }

  all(): Node[] {
    return Array.from(this.nodes.values())
  }

  allEdges(): Edge[] {
    return Array.from(this.edges.values())
  }

  childrenOf(parentId: string): Node[] {
    return this.all().filter((n) => n.parentId === parentId)
  }

  finalize(meta: Meta): Snapshot {
    // Derive `contains` from parentId so the two can never disagree.
    for (const n of this.nodes.values()) {
      if (!n.parentId) continue
      if (!this.nodes.has(n.parentId)) {
        this.warn({ code: 'graph.missingParent', severity: 'warn', message: `${n.id} points at missing parent ${n.parentId}`, nodeId: n.id })
        delete n.parentId
        continue
      }
      this.edge({ kind: 'contains', source: n.parentId, target: n.id })
      if (n.loadTiming === undefined) n.loadTiming = defaultLoadTiming(n)
    }
    for (const n of this.nodes.values()) if (n.loadTiming === undefined) n.loadTiming = defaultLoadTiming(n)

    const edges: Edge[] = []
    for (const e of this.edges.values()) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) {
        this.warn({ code: 'graph.danglingEdge', severity: 'info', message: `dropped ${e.kind} edge ${e.source} -> ${e.target}` })
        continue
      }
      edges.push(e)
    }
    const nodes = this.all().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const nodesByKind: Partial<Record<NodeKind, number>> = {}
    for (const n of nodes) nodesByKind[n.kind] = (nodesByKind[n.kind] ?? 0) + 1
    const edgesByKind: Partial<Record<EdgeKind, number>> = {}
    for (const e of edges) edgesByKind[e.kind] = (edgesByKind[e.kind] ?? 0) + 1
    const filesInlined = Object.values(this.files).filter((f) => f.content !== undefined).length
    const layers = new Set(nodes.map((n) => n.layer))

    return {
      schemaVersion: SCHEMA_VERSION,
      meta: { ...meta, counts: { nodesByKind, edgesByKind, filesInlined }, layersPresent: Array.from(layers) },
      nodes,
      edges,
      files: this.files,
      warnings: this.warnings,
    }
  }
}

/** When no scanner set it, infer how an artifact enters a session from its kind and flags. */
export function defaultLoadTiming(n: Node): LoadTiming | undefined {
  const disabled = n.flags?.includes('disabled') || n.flags?.includes('missing') || n.flags?.includes('ghost')
  switch (n.kind) {
    case 'settings':
    case 'claudeJson':
    case 'projectState':
    case 'permissionRule':
    case 'keybindings':
    case 'importedDoc':
    case 'memoryIndex':
    case 'connector':
    case 'pluginManifest':
    case 'hooksFile':
      return 'startup'
    case 'claudeMd':
      return (n.data as { role?: string }).role === 'nested' ? 'lazy' : 'startup'
    case 'rulesFile':
      return (n.data as { lazy?: boolean }).lazy ? 'lazy' : 'startup'
    case 'skill':
    case 'command':
    case 'agent':
      return disabled ? 'never' : 'startup'
    case 'mcpServer': {
      const approval = (n.data as { approval?: string }).approval
      return disabled || approval === 'disabled' || approval === 'pending' ? 'never' : 'startup'
    }
    case 'plugin':
      return disabled || (n.data as { enabledInSettings?: boolean }).enabledInSettings === false ? 'never' : 'startup'
    case 'hookEvent':
    case 'hookGroup':
    case 'hook':
      return disabled ? 'never' : 'onEvent'
    case 'memoryFile':
    case 'outputStyle':
    case 'launchConfig':
      return 'lazy'
    case 'session':
    case 'liveSession':
    case 'logFile':
    case 'plan':
    case 'stateDir':
    case 'credentials':
    case 'brokenFile':
    case 'pluginData':
    case 'desktopConfig':
      return 'never'
    default:
      return isContainerKind(n.kind) ? undefined : undefined
  }
}
