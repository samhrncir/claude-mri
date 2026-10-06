// Safe filesystem helpers: never throw, always bounded.
import { createHash } from 'node:crypto'
import type { Dirent, Stats } from 'node:fs'
import { open, readdir, realpath, stat, lstat } from 'node:fs/promises'
import type { FileKind } from '../../shared/snapshot.js'
import { joinPath, normalizePath } from './paths.js'

export async function statSafe(p: string): Promise<Stats | null> {
  try {
    return await stat(p)
  } catch {
    return null
  }
}

export async function lstatSafe(p: string): Promise<Stats | null> {
  try {
    return await lstat(p)
  } catch {
    return null
  }
}

export async function realpathSafe(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

/** Directory entries sorted by name; empty on any error. */
export async function readdirSorted(dir: string): Promise<Dirent[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  } catch {
    return []
  }
}

export interface TextRead {
  text: string
  truncated: boolean
  size: number
  mtimeMs: number
}

/** Reads up to maxBytes of a file as UTF-8. Null when missing or unreadable. */
export async function readTextCapped(p: string, maxBytes: number): Promise<TextRead | null> {
  let handle
  try {
    handle = await open(p, 'r')
    const st = await handle.stat()
    const toRead = Math.min(st.size, maxBytes)
    const buf = Buffer.alloc(toRead)
    let offset = 0
    while (offset < toRead) {
      const { bytesRead } = await handle.read(buf, offset, toRead - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return { text: buf.subarray(0, offset).toString('utf8').replace(/^﻿/, ''), truncated: st.size > maxBytes, size: st.size, mtimeMs: st.mtimeMs }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** First `maxLines` lines (or maxBytes), for peeking at JSONL transcripts. */
export async function readFirstLines(p: string, opts: { maxLines: number; maxBytes: number }): Promise<string[]> {
  const read = await readTextCapped(p, opts.maxBytes)
  if (!read) return []
  const lines = read.text.split(/\r?\n/)
  // Drop a trailing partial line when the read was truncated.
  if (read.truncated) lines.pop()
  return lines.filter((l) => l.length > 0).slice(0, opts.maxLines)
}

export type JsonReadResult =
  | { ok: true; value: unknown; raw: string; size: number; mtimeMs: number }
  | { ok: false; reason: 'missing' | 'tooLarge' | 'parse'; error: string; raw?: string; size?: number; mtimeMs?: number; line?: number; column?: number }

export function jsonErrorPosition(message: string, raw: string): { line?: number; column?: number } {
  const lc = message.match(/line (\d+) column (\d+)/)
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) }
  const pos = message.match(/position (\d+)/)
  if (!pos) return {}
  const index = Number(pos[1])
  const before = raw.slice(0, index)
  const line = before.split('\n').length
  const column = index - before.lastIndexOf('\n')
  return { line, column }
}

/** Strict JSON read with size cap; parse failures return the raw text so callers can try JSONC. */
export async function readJsonFile(p: string, maxBytes = 2 * 1024 * 1024): Promise<JsonReadResult> {
  const read = await readTextCapped(p, maxBytes)
  if (!read) return { ok: false, reason: 'missing', error: 'file missing or unreadable' }
  if (read.truncated) return { ok: false, reason: 'tooLarge', error: `file exceeds ${maxBytes} bytes`, size: read.size, mtimeMs: read.mtimeMs }
  try {
    return { ok: true, value: JSON.parse(read.text), raw: read.text, size: read.size, mtimeMs: read.mtimeMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'parse', error: message, raw: read.text, size: read.size, mtimeMs: read.mtimeMs, ...jsonErrorPosition(message, read.text) }
  }
}

export interface WalkOptions {
  maxDepth: number
  skipDirs: ReadonlySet<string>
  maxEntries: number
}

export interface WalkedDir {
  path: string
  depth: number
  entries: Dirent[]
}

/** Breadth-first directory walk that never follows symlinked directories and stops at maxEntries. */
export async function* walkDirs(root: string, opts: WalkOptions): AsyncGenerator<WalkedDir> {
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }]
  let seen = 0
  while (queue.length > 0) {
    const current = queue.shift() as { path: string; depth: number }
    const entries = await readdirSorted(current.path)
    seen += entries.length
    yield { path: current.path, depth: current.depth, entries }
    if (seen > opts.maxEntries || current.depth >= opts.maxDepth) continue
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue
      if (opts.skipDirs.has(e.name)) continue
      queue.push({ path: joinPath(current.path, e.name), depth: current.depth + 1 })
    }
  }
}

export interface DirSummary {
  fileCount: number
  totalBytes: number
  shallow: boolean
}

/** Bounded recursive size summary of a directory (counts stop once maxEntries is exceeded). */
export async function dirSummary(dir: string, maxEntries = 2000): Promise<DirSummary> {
  let fileCount = 0
  let totalBytes = 0
  let shallow = false
  for await (const d of walkDirs(dir, { maxDepth: 6, skipDirs: new Set(), maxEntries })) {
    for (const e of d.entries) {
      if (e.isFile()) {
        fileCount += 1
        const st = await statSafe(joinPath(d.path, e.name))
        if (st) totalBytes += st.size
      }
    }
    if (fileCount > maxEntries) {
      shallow = true
      break
    }
  }
  return { fileCount, totalBytes, shallow }
}

export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    active -= 1
    queue.shift()?.()
  }
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1
        fn().then(resolve, reject).finally(next)
      }
      if (active < concurrency) run()
      else queue.push(run)
    })
}

export function sha1(text: string | Buffer): string {
  return createHash('sha1').update(text).digest('hex')
}

export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 512)
  let suspicious = 0
  for (const byte of sample) if (byte === 0 || (byte < 7 && byte !== 0)) suspicious += 1
  return suspicious > 0
}

export function fileKindOf(p: string): FileKind {
  const lower = normalizePath(p, 'linux').toLowerCase()
  if (lower.endsWith('.jsonl')) return 'jsonl'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  return 'text'
}
