// Calls to the local server. Every function rejects when the server is unreachable so the app can fall back to demo/shared modes.
import type { FileResponse, HealthResponse, SseEvent } from '../../shared/api.js'
import type { Snapshot } from '../../shared/snapshot.js'

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health')
}

export function fetchSnapshot(): Promise<Snapshot> {
  return getJson<Snapshot>('/api/snapshot')
}

export function fetchFile(id: string): Promise<FileResponse> {
  return getJson<FileResponse>(`/api/file?id=${encodeURIComponent(id)}`)
}

export async function rescan(): Promise<void> {
  const res = await fetch('/api/rescan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (!res.ok) throw new Error(`rescan failed: HTTP ${res.status}`)
}

export async function openInFileManager(id: string): Promise<void> {
  const res = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  if (!res.ok) throw new Error(`open failed: HTTP ${res.status}`)
}

export async function addRoot(path: string): Promise<void> {
  const res = await fetch('/api/roots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })
  if (!res.ok) throw new Error(`add root failed: HTTP ${res.status}`)
}

export function exportUrl(anonymize: boolean): string {
  return `/api/export${anonymize ? '?anonymize=1' : ''}`
}

/** Subscribes to server events; returns an unsubscribe function. Reconnects are handled by EventSource. */
export function subscribeEvents(onEvent: (event: SseEvent) => void, onError?: () => void): () => void {
  const source = new EventSource('/api/events')
  source.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data as string) as SseEvent)
    } catch {
      // ignore malformed frames
    }
  }
  if (onError) source.onerror = onError
  return () => source.close()
}
