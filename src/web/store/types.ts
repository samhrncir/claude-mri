import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react'
import type { EdgeKind, Family, Layer, LoadTiming, NodeFlag, NodeKind, Scope } from '../../shared/kinds.js'
import type { Edge, Node, NodeStats, Warning } from '../../shared/snapshot.js'

export type Mode = 'local' | 'shared' | 'demo'
export type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
export type ZoomBucket = 'far' | 'mid' | 'near'

export interface Indexes {
  byId: Map<string, Node>
  childrenOf: Map<string, string[]>
  parentOf: Map<string, string>
  edgesBySource: Map<string, Edge[]>
  edgesByTarget: Map<string, Edge[]>
  warningsByNode: Map<string, Warning[]>
  /** Children of the (unrendered) machine node, i.e. the top-level containers. */
  topLevel: string[]
  countsByKind: Partial<Record<NodeKind, number>>
}

export interface Filters {
  layers: Set<Layer>
  hiddenKinds: Set<NodeKind>
  problemsOnly: boolean
  tokenView: boolean
}

export interface RFNodeData extends Record<string, unknown> {
  nodeId: string
  kind: NodeKind | 'section'
  sectionKind?: NodeKind
  label: string
  summary: string
  family: Family
  scope: Scope
  loadTiming?: LoadTiming
  flags: NodeFlag[]
  hasProblem: boolean
  isContainer: boolean
  collapsed: boolean
  childCount: number
  counts: { kind: string; n: number }[]
  stats?: NodeStats
  invocation?: string
  ruleEffect?: 'allow' | 'deny' | 'ask'
  tokenShare?: number
  partition: number
}

export type GraphNode = RFNode<RFNodeData, 'container' | 'collapsed' | 'card' | 'pill'>

export interface RFEdgeData extends Record<string, unknown> {
  kind: EdgeKind | 'aggregated'
  baseKind: EdgeKind
  family: Family
  label?: string
  count: number
  memberIds: string[]
  stroke: 'solid' | 'dashed' | 'dotted'
  animated: boolean
}

export type GraphEdge = RFEdge<RFEdgeData, 'kind'>

export interface LaneBox {
  partition: number
  title: string
  caption: string
  x: number
  y: number
  width: number
}

export interface Highlight {
  nodeIds: Set<string>
  edgeIds: Set<string>
}
