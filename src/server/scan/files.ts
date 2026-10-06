// Registers files in the snapshot and reads JSON config files, turning parse failures into brokenFile nodes.
import { idOf } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { FileEntry, FileKind } from '../../shared/snapshot.js'
import { redactSecretsDeep } from '../redact.js'
import type { ScanContext } from './context.js'
import { fileKindOf, readJsonFile, sha1, statSafe } from './fsx.js'
import { parseJsonc } from './jsonSafe.js'
import { basenameOf } from './paths.js'

export const INLINE_JSON_MAX = 64 * 1024
export const INLINE_MD_MAX = 32 * 1024
export const MD_READ_MAX = 256 * 1024
const EXCERPT_LINES = 60
const EXCERPT_BYTES = 4096

export function excerptOf(text: string): string {
  const head = text.split(/\r?\n/).slice(0, EXCERPT_LINES).join('\n')
  return head.length > EXCERPT_BYTES ? `${head.slice(0, EXCERPT_BYTES)}…` : head
}

export interface FileInfo {
  size: number
  mtimeMs: number
  kind?: FileKind
  content?: string
  excerpt?: string
  sha1?: string
  truncated?: boolean
  error?: string
  parsedWithJsonc?: boolean
  contentIsNormalized?: boolean
}

export function addFile(ctx: ScanContext, abs: string, info: FileInfo): FileEntry {
  const entry: FileEntry = { id: ctx.idPath(abs), path: abs, size: info.size, mtimeMs: info.mtimeMs, kind: info.kind ?? fileKindOf(abs) }
  if (info.content !== undefined) entry.content = info.content
  if (info.excerpt !== undefined) entry.excerpt = info.excerpt
  if (info.sha1 !== undefined) entry.sha1 = info.sha1
  if (info.truncated) entry.truncated = true
  if (info.error !== undefined) entry.error = info.error
  if (info.parsedWithJsonc) entry.parsedWithJsonc = true
  if (info.contentIsNormalized) entry.contentIsNormalized = true
  return ctx.b.file(entry)
}

export async function fileExists(abs: string): Promise<boolean> {
  return (await statSafe(abs))?.isFile() ?? false
}

export async function dirExists(abs: string): Promise<boolean> {
  return (await statSafe(abs))?.isDirectory() ?? false
}

export interface JsonConfig {
  value: Record<string, unknown>
  entry: FileEntry
  raw: string
}

export interface JsonConfigOptions {
  intendedKind: string
  scope: Scope
  parentId?: string
  inline?: boolean
}

function emitBroken(ctx: ScanContext, abs: string, o: JsonConfigOptions, info: { error: string; raw?: string; size?: number; mtimeMs?: number; line?: number; column?: number }): void {
  const jsonc = info.raw ? parseJsonc(info.raw) : { ok: false as const, error: 'no content' }
  const entry = addFile(ctx, abs, { size: info.size ?? 0, mtimeMs: info.mtimeMs ?? 0, excerpt: info.raw ? excerptOf(info.raw) : undefined, error: info.error, parsedWithJsonc: jsonc.ok })
  const node = ctx.b.node({
    id: idOf('brokenFile', ctx.idPath(abs)),
    kind: 'brokenFile',
    label: basenameOf(abs),
    scope: o.scope,
    layer: 'state',
    parentId: o.parentId,
    path: abs,
    fileId: entry.id,
    summary: jsonc.ok
      ? `Invalid JSON (${o.intendedKind}): it only parses as JSONC (comments or trailing commas), which Claude Code rejects.`
      : `Invalid JSON (${o.intendedKind}): ${info.error}`,
    data: { error: info.error, line: info.line, column: info.column, parsedWithJsonc: jsonc.ok, intendedKind: o.intendedKind },
    flags: ['broken'],
  })
  ctx.b.warn({ code: 'json.parse', severity: 'error', message: `${abs}: ${info.error}`, path: abs, nodeId: node.id })
}

/** Reads a JSON object file. Missing -> null (silently); too large or invalid -> warning (+ brokenFile node) and null. */
export async function readJsonConfig(ctx: ScanContext, abs: string, o: JsonConfigOptions): Promise<JsonConfig | null> {
  const res = await readJsonFile(abs)
  if (!res.ok) {
    if (res.reason === 'missing') return null
    if (res.reason === 'tooLarge') {
      addFile(ctx, abs, { size: res.size ?? 0, mtimeMs: res.mtimeMs ?? 0, error: res.error })
      ctx.b.warn({ code: 'fs.tooLarge', severity: 'warn', message: `${abs}: ${res.error}`, path: abs })
      return null
    }
    emitBroken(ctx, abs, o, res)
    return null
  }
  if (typeof res.value !== 'object' || res.value === null || Array.isArray(res.value)) {
    emitBroken(ctx, abs, o, { error: 'top-level value must be an object', raw: res.raw, size: res.size, mtimeMs: res.mtimeMs })
    return null
  }
  const entry = addFile(ctx, abs, { size: res.size, mtimeMs: res.mtimeMs, sha1: sha1(res.raw) })
  if (o.inline !== false && res.size <= INLINE_JSON_MAX) {
    entry.content = JSON.stringify(redactSecretsDeep(res.value), null, 2)
    entry.contentIsNormalized = true
  }
  return { value: res.value as Record<string, unknown>, entry, raw: res.raw }
}
