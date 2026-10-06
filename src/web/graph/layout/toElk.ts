// GraphNode[] -> ELK graph. Top level: layered left-to-right with lane partitions. Containers: box packing,
// or layered top-down when their direct children are linked by edges.
import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api.js'
import type { GraphEdge, GraphNode } from '../../store/types.js'
import { CONTAINER_PADDING } from '../sizes.js'

export const ROOT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.partitioning.activate': 'true',
  'elk.spacing.nodeNode': '56',
  'elk.layered.spacing.nodeNodeBetweenLayers': '140',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.edgeRouting': 'POLYLINE',
  'elk.separateConnectedComponents': 'false',
  'elk.randomSeed': '1',
}

const PADDING = `[top=${CONTAINER_PADDING.top},left=${CONTAINER_PADDING.side},bottom=${CONTAINER_PADDING.bottom},right=${CONTAINER_PADDING.side}]`

const MIN_SIZE: LayoutOptions = { 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': '(300, 110)' }

function containerOptions(hasInternalEdges: boolean, childCount: number): LayoutOptions {
  if (hasInternalEdges) {
    return { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '24', 'elk.layered.spacing.nodeNodeBetweenLayers': '40', 'elk.padding': PADDING, 'elk.edgeRouting': 'POLYLINE', ...MIN_SIZE }
  }
  return {
    'elk.algorithm': 'box',
    'elk.box.packingMode': 'SIMPLE',
    'elk.aspectRatio': childCount > 40 ? '2.2' : '1.6',
    'elk.spacing.nodeNode': '14',
    'elk.padding': PADDING,
    'elk.expandNodes': 'false',
    ...MIN_SIZE,
  }
}

export function toElk(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): ElkNode {
  const byParent = new Map<string | undefined, GraphNode[]>()
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n])
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  const topAncestor = (id: string): string => {
    let cur = id
    while (parentOf.get(cur)) cur = parentOf.get(cur) as string
    return cur
  }

  const build = (n: GraphNode): ElkNode => {
    const kids = byParent.get(n.id) ?? []
    if (n.type !== 'container' || kids.length === 0) {
      return { id: n.id, width: n.width ?? 220, height: n.height ?? 64 }
    }
    const kidIds = new Set(kids.map((k) => k.id))
    const internal = edges.filter((e) => kidIds.has(e.source) && kidIds.has(e.target) && e.source !== e.target)
    return {
      id: n.id,
      layoutOptions: containerOptions(internal.length > 0, kids.length),
      children: kids.map(build),
      edges: internal.map<ElkExtendedEdge>((e) => ({ id: `${n.id}|${e.id}`, sources: [e.source], targets: [e.target] })),
    }
  }

  const top = byParent.get(undefined) ?? []
  const lifted = new Map<string, ElkExtendedEdge>()
  for (const e of edges) {
    const s = topAncestor(e.source)
    const t = topAncestor(e.target)
    if (s === t) continue
    const key = `${s}->${t}`
    if (!lifted.has(key)) lifted.set(key, { id: `lift:${key}`, sources: [s], targets: [t] })
  }
  return {
    id: 'root',
    layoutOptions: ROOT_OPTIONS,
    children: top.map((n) => ({ ...build(n), layoutOptions: { ...(build(n).layoutOptions ?? {}), 'elk.partitioning.partition': String(n.data.partition) } })),
    edges: Array.from(lifted.values()),
  }
}

export interface Placed {
  x: number
  y: number
  width: number
  height: number
}

/** Flattens an ELK result into per-node geometry (child positions stay relative to their parent, as React Flow expects). */
export function fromElk(root: ElkNode): Map<string, Placed> {
  const out = new Map<string, Placed>()
  const walk = (n: ElkNode) => {
    for (const c of n.children ?? []) {
      out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 })
      walk(c)
    }
  }
  walk(root)
  return out
}
