// The local HTTP server: scans, serves the UI and the API, watches config files, and streams events.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { Snapshot } from '../shared/snapshot.js'
import { log } from './log.js'
import { openUrl } from './openBrowser.js'
import { handleApi, type AppState } from './routes.js'
import type { ScanOptions } from './scan/context.js'
import type { ScanEnv } from './scan/env.js'
import { scanWithEnrichment } from './scan/index.js'
import { createSseHub } from './sse.js'
import { createStaticHandler } from './static.js'
import { createWatcher, type Watcher } from './watch.js'

export interface ServerOptions {
  env: ScanEnv
  scanOptions: ScanOptions
  /** Fixed port, or undefined to try 4848..4858. 0 asks the OS for a free port (tests). */
  port?: number
  open: boolean
  watch: boolean
  toolVersion: string
  webRoot?: string
}

export interface RunningServer {
  url: string
  port: number
  state: AppState
  close(): Promise<void>
}

const DEFAULT_PORT = 4848
const PORT_ATTEMPTS = 11

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve((server.address() as AddressInfo).port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function startServer(o: ServerOptions): Promise<RunningServer> {
  const webRoot = o.webRoot ?? fileURLToPath(new URL('../web/', import.meta.url))
  const serveStatic = createStaticHandler(webRoot)
  const sse = createSseHub()
  let watcher: Watcher | null = null

  const state: AppState = {
    snapshot: null,
    scanning: null,
    roots: [...o.env.roots],
    sse,
    toolVersion: o.toolVersion,
    port: 0,
    watchHealth: () => (o.watch ? (watcher?.health ?? 'off') : 'off'),
    rescan(): Promise<Snapshot> {
      if (state.scanning) return state.scanning
      const run = (async () => {
        sse.broadcast({ type: 'scan-start', at: new Date().toISOString() })
        const env: ScanEnv = { ...o.env, roots: [...state.roots] }
        const result = await scanWithEnrichment(env, o.scanOptions, (phase, done, total) => sse.broadcast({ type: 'scan-progress', phase, done, total }))
        state.snapshot = result.snapshot
        sse.broadcast({ type: 'scan-done', snapshotId: result.snapshot.meta.snapshotId, durationMs: result.snapshot.meta.durationMs })
        void result.enriched.then((snap) => {
          if (o.scanOptions.cli) sse.broadcast({ type: 'enrich-done', snapshotId: snap.meta.snapshotId })
        })
        if (o.watch) {
          watcher?.close()
          watcher = createWatcher(result.snapshot, (paths) => sse.broadcast({ type: 'file-changed', paths, at: new Date().toISOString() }))
          log.debug(`watching ${watcher.count} locations (${watcher.health})`)
        }
        return result.snapshot
      })()
      state.scanning = run
      run
        .catch((err: unknown) => {
          sse.broadcast({ type: 'scan-error', message: err instanceof Error ? err.message : String(err) })
          log.warn('scan failed:', err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          state.scanning = null
        })
      return run
    },
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (await handleApi(req, res, state)) return
        if (await serveStatic(req, res)) return
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found')
      } catch (err) {
        log.warn('request failed:', err instanceof Error ? err.message : String(err))
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('internal error')
      }
    })()
  })
  server.keepAliveTimeout = 65_000

  let port = 0
  if (o.port !== undefined) {
    port = await listen(server, o.port)
  } else {
    let lastErr: unknown
    for (let i = 0; i < PORT_ATTEMPTS; i += 1) {
      try {
        port = await listen(server, DEFAULT_PORT + i)
        break
      } catch (err) {
        lastErr = err
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
      }
    }
    if (port === 0) throw lastErr instanceof Error ? lastErr : new Error('no free port between 4848 and 4858')
  }
  state.port = port
  const url = `http://127.0.0.1:${port}`

  void state.rescan().catch(() => undefined)
  if (o.open) openUrl(url)

  return {
    url,
    port,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        watcher?.close()
        sse.close()
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
