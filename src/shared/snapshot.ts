// The snapshot is the single data contract between the scanner (server) and the graph UI (web).
import type { EdgeKind, Layer, LoadTiming, NodeFlag, NodeKind, Platform, Scope, SettingsLevel } from './kinds.js'
import type { NodeData } from './nodeData.js'

export const SCHEMA_VERSION = 1

export interface Probe {
  path: string
  exists: boolean
  error?: string
}

export interface SnapshotCounts {
  nodesByKind: Partial<Record<NodeKind, number>>
  edgesByKind: Partial<Record<EdgeKind, number>>
  filesInlined: number
}

export interface Meta {
  toolVersion: string
  snapshotId: string
  scannedAt: string
  durationMs: number
  platform: Platform
  homeDir: string
  configDir: string
  configDirOverridden: boolean
  claudeJsonPath: string
  claudeVersion?: string
  cliAvailable: boolean
  roots: string[]
  mode: 'local' | 'shared'
  redaction: 'local' | 'export' | 'anonymized'
  probes: { managedSettings: Probe[]; claudeDesktop: Probe; registryPolicy?: Probe }
  counts: SnapshotCounts
  layersPresent: Layer[]
}

export type FileKind = 'json' | 'jsonl' | 'markdown' | 'text' | 'binary' | 'dir'

export interface FileEntry {
  id: string
  path: string
  size: number
  mtimeMs: number
  kind: FileKind
  sha1?: string
  /** Inlined text per the files policy; otherwise fetched on demand via GET /api/file. */
  content?: string
  excerpt?: string
  truncated?: boolean
  error?: string
  parsedWithJsonc?: boolean
  /** True when `content` was re-serialized from the redacted object rather than read verbatim. */
  contentIsNormalized?: boolean
}

export interface NodeStats {
  sizeBytes?: number
  lines?: number
  fileCount?: number
  tokensAlwaysOn?: number
  tokensOnInvoke?: number
  usageCount?: number
  lastUsedAt?: string
  costUSD?: number
  sessionCount?: number
  lastSessionAt?: string
}

export interface Node<K extends NodeKind = NodeKind> {
  id: string
  kind: K
  label: string
  scope: Scope
  layer: Layer
  /** Compound grouping; authoritative. `contains` edges are derived from it. */
  parentId?: string
  path?: string
  fileId?: string
  /** One newcomer-friendly line. */
  summary: string
  loadTiming?: LoadTiming
  data: NodeData<K>
  stats?: NodeStats
  flags?: NodeFlag[]
}

export interface EdgeData {
  reason?: string
  key?: string
  matcher?: string
  rule?: string
  effect?: 'allow' | 'ask' | 'deny'
  via?: 'exact' | 'regex' | 'prefix' | 'all'
  missing?: boolean
  external?: boolean
  cycle?: boolean
  depth?: number
  depthExceeded?: boolean
  count?: number
  memberIds?: string[]
  usageCount?: number
  lastUsedAt?: string
  options?: Record<string, unknown>
  source?: string
}

export interface Edge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  label?: string
  data?: EdgeData
}

export type WarningSeverity = 'info' | 'warn' | 'error'

export interface Warning {
  code: string
  severity: WarningSeverity
  message: string
  path?: string
  nodeId?: string
}

/** A value plus the settings file it came from. */
export interface Prov<T> {
  value: T
  from: string
  level: SettingsLevel
}

export interface EffectiveView {
  permissions: { allow: Prov<string>[]; deny: Prov<string>[]; ask: Prov<string>[]; defaultMode?: Prov<string> }
  hooks: Record<string, { groups: number; from: string[] }>
  env: Record<string, Prov<string>>
  model?: Prov<string>
  effortLevel?: Prov<string>
  outputStyle?: Prov<string>
  enabledPlugins: Record<string, Prov<boolean>>
  disableAllHooks?: Prov<boolean>
}

export interface Snapshot {
  schemaVersion: typeof SCHEMA_VERSION
  meta: Meta
  nodes: Node[]
  edges: Edge[]
  files: Record<string, FileEntry>
  warnings: Warning[]
}

export function isKind<K extends NodeKind>(node: Node, kind: K): node is Node<K> {
  return node.kind === kind
}
