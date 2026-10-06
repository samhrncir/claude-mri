// Shape check for snapshots loaded from files other people exported. Throws a readable message.
import { NODE_KINDS } from '../../shared/kinds.js'
import type { Snapshot } from '../../shared/snapshot.js'

export function assertSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== 'object') throw new Error('not a JSON object')
  const v = value as Record<string, unknown>
  if (v.schemaVersion !== 1) throw new Error(`unsupported schemaVersion ${String(v.schemaVersion)} (expected 1)`)
  if (!v.meta || typeof v.meta !== 'object') throw new Error('missing meta')
  if (!Array.isArray(v.nodes)) throw new Error('nodes must be an array')
  if (!Array.isArray(v.edges)) throw new Error('edges must be an array')
  if (!v.files || typeof v.files !== 'object') throw new Error('files must be an object')
  if (!Array.isArray(v.warnings)) throw new Error('warnings must be an array')
  const kinds = new Set<string>(NODE_KINDS)
  const ids = new Set<string>()
  for (const n of v.nodes as unknown[]) {
    if (!n || typeof n !== 'object') throw new Error('node is not an object')
    const node = n as Record<string, unknown>
    if (typeof node.id !== 'string' || typeof node.kind !== 'string' || typeof node.label !== 'string') throw new Error('node is missing id, kind or label')
    if (!kinds.has(node.kind)) throw new Error(`unknown node kind "${node.kind}"`)
    ids.add(node.id)
  }
  for (const e of v.edges as unknown[]) {
    if (!e || typeof e !== 'object') throw new Error('edge is not an object')
    const edge = e as Record<string, unknown>
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || typeof edge.kind !== 'string') throw new Error('edge is missing source, target or kind')
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`edge ${String(edge.id)} points at a missing node`)
  }
  return value as Snapshot
}
