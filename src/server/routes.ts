// JSON API handlers. Everything here assumes a loopback-only server; the Host/Origin checks defend against
// pages on other origins (or DNS rebinding) poking at the local service.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostname, userInfo } from 'node:os'
import type { FileResponse, HealthResponse, RescanResponse } from '../shared/api.js'
import type { Snapshot } from '../shared/snapshot.js'
import { buildExport, exportFilename } from './export.js'
import { openPath } from './openBrowser.js'
import { redactForExport } from './redact.js'
import { readTextCapped, looksBinary } from './scan/fsx.js'
import { dirnameOf, normalizePath } from './scan/paths.js'
import type { SseHub } from './sse.js'
import type { WatchHealth } from './watch.js'

export interface AppState {
  snapshot: Snapshot | null
  scanning: Promise<Snapshot> | null
  roots: string[]
  sse: SseHub
  toolVersion: string
  port: number
  watchHealth(): WatchHealth
  rescan(): Promise<Snapshot>
}

const FILE_MAX = 1024 * 1024
const BODY_MAX = 64 * 1024
const DENY_FILE = /(^|[\\/])(\.claude\.json|history\.jsonl|\.credentials\.json)$|\.jsonl$|\.key$/i

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(Buffer.byteLength(text)), 'Cache-Control': 'no-store', ...headers })
  res.end(text)
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > BODY_MAX) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

function hostAllowed(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host ?? ''
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`
}

function safeUsername(): string | undefined {
  try {
    return userInfo().username
  } catch {
    return undefined
  }
}

async function currentSnapshot(state: AppState): Promise<Snapshot | null> {
  if (state.snapshot) return state.snapshot
  if (state.scanning) return state.scanning.catch(() => null)
  return null
}

/** Returns false when the request is not under /api so the static handler can take it. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, state: AppState): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local')
  if (!url.pathname.startsWith('/api/')) return false
  const method = req.method ?? 'GET'
  if (!hostAllowed(req, state.port)) {
    json(res, 421, { error: 'unexpected Host header' })
    return true
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}`) {
      json(res, 403, { error: 'cross-origin requests are not allowed' })
      return true
    }
    const type = String(req.headers['content-type'] ?? '')
    if (method !== 'DELETE' && !type.startsWith('application/json')) {
      json(res, 415, { error: 'send application/json' })
      return true
    }
  }

  switch (url.pathname) {
    case '/api/health': {
      const body: HealthResponse = { ok: true, toolVersion: state.toolVersion, snapshotId: state.snapshot?.meta.snapshotId ?? null, scanning: state.scanning !== null, watch: state.watchHealth(), mode: 'local', port: state.port }
      json(res, 200, body)
      return true
    }
    case '/api/snapshot': {
      const snap = await currentSnapshot(state)
      if (!snap) {
        json(res, 503, { error: 'scan failed or has not run' })
        return true
      }
      const etag = `"${snap.meta.snapshotId}"`
      if (req.headers['if-none-match'] === etag && url.searchParams.get('redact') !== 'export') {
        res.writeHead(304, { ETag: etag }).end()
        return true
      }
      const body = url.searchParams.get('redact') === 'export' ? redactForExport(snap, { home: snap.meta.homeDir, platform: snap.meta.platform, username: safeUsername(), hostname: hostname() }) : snap
      json(res, 200, body, { ETag: etag })
      return true
    }
    case '/api/rescan': {
      if (method !== 'POST') break
      const promise = state.rescan()
      if (url.searchParams.get('wait') === '1') {
        try {
          json(res, 200, await promise)
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
        return true
      }
      const body: RescanResponse = { started: true, snapshotId: state.snapshot?.meta.snapshotId ?? null }
      json(res, 202, body)
      return true
    }
    case '/api/file': {
      const snap = await currentSnapshot(state)
      const id = url.searchParams.get('id') ?? ''
      const entry = snap?.files[id]
      if (!snap || !entry) {
        json(res, 404, { error: 'unknown file id' })
        return true
      }
      if (DENY_FILE.test(entry.path) || entry.kind === 'dir') {
        json(res, 403, { error: 'this file is never served' })
        return true
      }
      if (entry.size > FILE_MAX) {
        json(res, 413, { error: `file larger than ${FILE_MAX} bytes` })
        return true
      }
      const read = await readTextCapped(entry.path, FILE_MAX)
      if (!read) {
        json(res, 404, { error: 'file could not be read' })
        return true
      }
      if (looksBinary(Buffer.from(read.text.slice(0, 512), 'utf8'))) {
        json(res, 415, { error: 'binary file' })
        return true
      }
      const body: FileResponse = { id, path: entry.path, size: read.size, mtimeMs: read.mtimeMs, content: entry.content ?? read.text, truncated: read.truncated }
      json(res, 200, body)
      return true
    }
    case '/api/events': {
      state.sse.attach(req, res, { type: 'hello', snapshotId: state.snapshot?.meta.snapshotId ?? null, toolVersion: state.toolVersion })
      return true
    }
    case '/api/roots': {
      if (method === 'POST') {
        const raw = await readBody(req)
        if (raw === null) {
          json(res, 413, { error: 'body too large' })
          return true
        }
        let path: string | undefined
        try {
          path = (JSON.parse(raw) as { path?: unknown }).path as string | undefined
        } catch {
          json(res, 400, { error: 'invalid JSON' })
          return true
        }
        if (typeof path !== 'string' || path.trim() === '') {
          json(res, 400, { error: 'path is required' })
          return true
        }
        const normalized = normalizePath(path, process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux')
        if (!state.roots.includes(normalized)) state.roots.push(normalized)
        state.sse.broadcast({ type: 'roots-changed', roots: state.roots })
        void state.rescan().catch(() => undefined)
        json(res, 202, { roots: state.roots })
        return true
      }
      if (method === 'DELETE') {
        const path = url.searchParams.get('path') ?? ''
        state.roots = state.roots.filter((r) => r !== path)
        state.sse.broadcast({ type: 'roots-changed', roots: state.roots })
        void state.rescan().catch(() => undefined)
        json(res, 202, { roots: state.roots })
        return true
      }
      break
    }
    case '/api/open': {
      if (method !== 'POST') break
      const snap = await currentSnapshot(state)
      const raw = await readBody(req)
      let id = ''
      try {
        id = String((JSON.parse(raw ?? '{}') as { id?: unknown }).id ?? '')
      } catch {
        json(res, 400, { error: 'invalid JSON' })
        return true
      }
      const node = snap?.nodes.find((n) => n.id === id)
      const target = node?.path ?? snap?.files[id]?.path
      if (!target) {
        json(res, 404, { error: 'unknown id' })
        return true
      }
      const isDir = node !== undefined && (node.kind === 'project' || node.kind === 'worktree' || node.kind === 'plugin' || node.kind === 'stateDir' || node.kind === 'userScope' || node.kind === 'marketplace' || node.kind === 'syncedBucket')
      openPath(isDir ? target : dirnameOf(target))
      res.writeHead(204).end()
      return true
    }
    case '/api/export': {
      const snap = await currentSnapshot(state)
      if (!snap) {
        json(res, 503, { error: 'no snapshot yet' })
        return true
      }
      const anonymize = url.searchParams.get('anonymize') === '1'
      const body = buildExport(snap, { anonymize, username: safeUsername(), hostname: hostname() })
      json(res, 200, body, { 'Content-Disposition': `attachment; filename="${exportFilename()}"` })
      return true
    }
    default:
      break
  }
  json(res, 404, { error: 'not found' })
  return true
}
