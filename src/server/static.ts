// Serves the built web app from dist/web with a path-traversal guard and SPA fallback.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

export function createStaticHandler(webRoot: string): StaticHandler {
  const root = resolve(webRoot)
  const send = async (res: ServerResponse, file: string, method: string): Promise<boolean> => {
    const st = await stat(file).catch(() => null)
    if (!st || !st.isFile()) return false
    const ext = extname(file).toLowerCase()
    const hashed = /[\\/]assets[\\/]/.test(file)
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': String(st.size),
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    if (method === 'HEAD') {
      res.end()
      return true
    }
    await new Promise<void>((done) => {
      createReadStream(file).on('error', () => res.destroy()).on('close', () => done()).pipe(res)
    })
    return true
  }

  return async (req, res) => {
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') return false
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname)
    } catch {
      return false
    }
    if (pathname.includes('\0')) return false
    const target = resolve(root, `.${pathname}`)
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden')
      return true
    }
    const direct = target === root ? resolve(root, 'index.html') : target
    if (await send(res, direct, method)) return true
    if (extname(pathname) === '' && (await send(res, resolve(root, 'index.html'), method))) return true
    return false
  }
}
