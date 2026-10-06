// HTTP and SSE contract between the local server and the web UI.
import type { Snapshot } from './snapshot.js'

export interface HealthResponse {
  ok: true
  toolVersion: string
  snapshotId: string | null
  scanning: boolean
  watch: 'active' | 'degraded' | 'off'
  mode: 'local'
  port: number
}

export interface FileResponse {
  id: string
  path: string
  size: number
  mtimeMs: number
  content: string
  truncated: boolean
}

export interface AddRootRequest {
  path: string
}

export interface OpenRequest {
  /** A node id or file id present in the current snapshot. */
  id: string
}

export interface RescanResponse {
  started: boolean
  snapshotId: string | null
}

export type SseEvent =
  | { type: 'hello'; snapshotId: string | null; toolVersion: string }
  | { type: 'scan-start'; at: string }
  | { type: 'scan-progress'; phase: string; done: number; total: number }
  | { type: 'scan-done'; snapshotId: string; durationMs: number }
  | { type: 'enrich-done'; snapshotId: string }
  | { type: 'scan-error'; message: string }
  | { type: 'file-changed'; paths: string[]; at: string }
  | { type: 'roots-changed'; roots: string[] }

export type SnapshotResponse = Snapshot
