// Stable, deterministic, human-readable node ids: `${kind}:${scopedPath}[#${fragment}]`.
// scopedPath already uses `~/` for the home dir, so ids survive export and user renames.
import type { NodeKind } from './kinds.js'

export interface ParsedId {
  kind: NodeKind
  scopedPath: string
  fragment?: string
}

const KIND_SEP = ':'
const FRAG_SEP = '#'

function encodeSegment(value: string): string {
  // Only '#' needs escaping in the path portion; ':' after the kind is harmless because we split once.
  return value.replaceAll('%', '%25').replaceAll('#', '%23')
}

function decodeSegment(value: string): string {
  return value.replaceAll('%23', '#').replaceAll('%25', '%')
}

export function idOf(kind: NodeKind, scopedPath: string, fragment?: string): string {
  const base = `${kind}${KIND_SEP}${encodeSegment(scopedPath)}`
  return fragment === undefined || fragment === '' ? base : `${base}${FRAG_SEP}${fragment}`
}

export function parseId(id: string): ParsedId | null {
  const kindEnd = id.indexOf(KIND_SEP)
  if (kindEnd <= 0) return null
  const kind = id.slice(0, kindEnd) as NodeKind
  const rest = id.slice(kindEnd + 1)
  const fragStart = rest.indexOf(FRAG_SEP)
  if (fragStart === -1) return { kind, scopedPath: decodeSegment(rest) }
  return {
    kind,
    scopedPath: decodeSegment(rest.slice(0, fragStart)),
    fragment: rest.slice(fragStart + 1),
  }
}

/** Id for a machine-wide singleton that has no file path, e.g. hookEvent:machine#PreToolUse. */
export function machineId(kind: NodeKind, fragment: string): string {
  return idOf(kind, 'machine', fragment)
}

/** Id for a cloud-side artifact that has no local file, e.g. connector:cloud#Google_Calendar. */
export function cloudId(kind: NodeKind, fragment: string): string {
  return idOf(kind, 'cloud', fragment)
}
