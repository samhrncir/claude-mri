// Server-Sent Events hub: one frame per event as `data: <json>`, with a keep-alive comment every 25 s.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SseEvent } from '../shared/api.js'

export interface SseHub {
  attach(req: IncomingMessage, res: ServerResponse, hello: SseEvent): void
  broadcast(event: SseEvent): void
  size(): number
  close(): void
}

function frame(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function createSseHub(): SseHub {
  const clients = new Set<ServerResponse>()
  const timer = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n')
  }, 25_000)
  timer.unref()
  return {
    attach(req, res, hello) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.write(frame(hello))
      clients.add(res)
      req.on('close', () => clients.delete(res))
    },
    broadcast(event) {
      const f = frame(event)
      for (const c of clients) c.write(f)
    },
    size: () => clients.size,
    close() {
      clearInterval(timer)
      for (const c of clients) c.end()
      clients.clear()
    },
  }
}
