// Shareable snapshots: export-level redaction plus optional anonymization of project names and personal content.
import { createHash } from 'node:crypto'
import type { Platform } from '../shared/kinds.js'
import type { Node, Snapshot } from '../shared/snapshot.js'
import { redactForExport } from './redact.js'

export interface ExportOptions {
  anonymize: boolean
  username?: string
  hostname?: string
}

export function exportFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `claude-mri-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}

export function buildExport(snapshot: Snapshot, opts: ExportOptions): Snapshot {
  const redacted = redactForExport(snapshot, { home: snapshot.meta.homeDir, platform: snapshot.meta.platform, username: opts.username, hostname: opts.hostname })
  return opts.anonymize ? anonymizeSnapshot(redacted) : redacted
}

/** Kinds whose file contents are personal (instructions, notes, plans, personal skills); JSON configs stay (already redacted). */
const PERSONAL_CONTENT_KINDS = new Set(['claudeMd', 'importedDoc', 'rulesFile', 'memoryIndex', 'memoryFile', 'plan', 'skill', 'agent', 'command', 'outputStyle'])

/** Segments under ~/.claude that are structural and public, so they are kept verbatim. */
const PATH_RE = /(~|[A-Za-z]:|\$cfg)((?:\/[^\s"'`<>|?*#]+)+)/g

export function hashSegment(segment: string): string {
  return `p-${createHash('sha1').update(segment).digest('hex').slice(0, 6)}`
}

function anonymizePath(path: string, platform: Platform): string {
  void platform
  return path.replace(PATH_RE, (_m, head: string, rest: string) => {
    const segments = rest.split('/').filter((s) => s !== '')
    if (head === '~' && segments[0] === '.claude') {
      // Config structure is public; only the encoded project folders carry user paths.
      return `${head}/${segments.map((s, i) => (i === 2 && segments[1] === 'projects' ? hashSegment(s) : s)).join('/')}`
    }
    if (head === '$cfg') return `${head}/${segments.map((s, i) => (i === 1 && segments[0] === 'projects' ? hashSegment(s) : s)).join('/')}`
    return `${head}/${segments.map(hashSegment).join('/')}`
  })
}

/** Hashes project path segments consistently everywhere, and drops personal text (plan titles, notes, branches, remotes). */
export function anonymizeSnapshot(snapshot: Snapshot): Snapshot {
  const platform = snapshot.meta.platform
  const copy = structuredClone(snapshot)
  const walkStrings = (value: unknown): unknown => {
    if (typeof value === 'string') return anonymizePath(value, platform)
    if (Array.isArray(value)) return value.map(walkStrings)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[anonymizePath(k, platform)] = walkStrings(v)
      return out
    }
    return value
  }

  for (const node of copy.nodes) {
    const data = node.data as Record<string, unknown>
    if (node.kind === 'project') {
      const p = node as Node<'project'>
      if (!p.data.isHome) node.label = hashSegment(node.label)
      delete data.gitRemote
    }
    if (node.kind === 'worktree') node.label = hashSegment(node.label)
    if (node.kind === 'plan') {
      node.label = 'plan'
      data.title = 'plan'
    }
    if (node.kind === 'memoryFile') {
      node.label = 'memory note'
      delete data.name
      delete data.description
    }
    if (node.kind === 'session') delete data.gitBranch
    if (node.kind === 'liveSession') {
      delete data.name
      node.label = `session (pid ${String(data.pid)})`
    }
    if (node.kind === 'marketplace') delete data.owner
    if (PERSONAL_CONTENT_KINDS.has(node.kind) && node.fileId) {
      const f = copy.files[node.fileId]
      if (f) {
        delete f.content
        delete f.excerpt
      }
    }
  }
  const files: Snapshot['files'] = {}
  for (const [id, f] of Object.entries(copy.files)) {
    const newId = anonymizePath(id, platform)
    files[newId] = { ...f, id: newId, path: anonymizePath(f.path, platform) }
  }
  const result = walkStrings({ ...copy, files }) as Snapshot
  result.meta.redaction = 'anonymized'
  return result
}
