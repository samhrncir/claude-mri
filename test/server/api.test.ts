import { mkdir, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer, type RunningServer } from '../../src/server/server.js'
import type { Snapshot } from '../../src/shared/snapshot.js'
import { GH_TOKEN, baseUser } from '../fixtures/trees/base.js'
import { makeFixture, TEST_SCAN_OPTIONS, type Fixture } from '../helpers/fixture.js'

let fixture: Fixture
let server: RunningServer
let base: string

const api = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init)

beforeAll(async () => {
  fixture = await makeFixture('win32', baseUser)
  const webRoot = `${fixture.dir}/web`
  await mkdir(`${webRoot}/assets`, { recursive: true })
  await writeFile(`${webRoot}/index.html`, '<!doctype html><title>t</title><div id="root"></div>', 'utf8')
  await writeFile(`${webRoot}/assets/app-abc123.js`, 'console.log(1)', 'utf8')
  server = await startServer({ env: fixture.env, scanOptions: TEST_SCAN_OPTIONS, port: 0, open: false, watch: false, toolVersion: '0.0.0-test', webRoot })
  base = server.url
  await server.state.rescan()
})

afterAll(async () => {
  await server.close()
  await fixture.cleanup()
})

describe('local API', () => {
  it('reports health and serves the snapshot with ETag support', async () => {
    const health = (await (await api('/api/health')).json()) as { ok: boolean; mode: string; watch: string }
    expect(health).toMatchObject({ ok: true, mode: 'local', watch: 'off' })
    const res = await api('/api/snapshot')
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()
    const snap = (await res.json()) as Snapshot
    expect(snap.nodes.length).toBeGreaterThan(20)
    const cached = await api('/api/snapshot', { headers: { 'If-None-Match': etag ?? '' } })
    expect(cached.status).toBe(304)
  })

  it('serves registered text files but never the deny-listed ones or unknown ids', async () => {
    const snap = (await (await api('/api/snapshot')).json()) as Snapshot
    const settingsId = Object.keys(snap.files).find((id) => id.endsWith('.claude/settings.json'))
    const ok = await api(`/api/file?id=${encodeURIComponent(settingsId ?? '')}`)
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { content: string }
    expect(body.content).toContain('enabledPlugins')
    expect(body.content).not.toContain('shh-secret')
    const stateId = Object.keys(snap.files).find((id) => id.endsWith('/.claude.json'))
    expect((await api(`/api/file?id=${encodeURIComponent(stateId ?? '')}`)).status).toBe(403)
    const historyId = Object.keys(snap.files).find((id) => id.endsWith('history.jsonl'))
    expect((await api(`/api/file?id=${encodeURIComponent(historyId ?? '')}`)).status).toBe(403)
    expect((await api('/api/file?id=nope')).status).toBe(404)
    expect((await api('/api/file?id=..%2F..%2Fetc%2Fpasswd')).status).toBe(404)
  })

  it('rejects foreign hosts, cross-origin writes and non-JSON bodies', async () => {
    // fetch refuses to override Host, so use the raw client for the DNS-rebinding check.
    const status = await new Promise<number>((resolve, reject) => {
      request({ host: '127.0.0.1', port: server.port, path: '/api/health', headers: { Host: 'evil.example:80' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      }).on('error', reject).end()
    })
    expect(status).toBe(421)
    expect((await api('/api/roots', { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
    expect((await api('/api/roots', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status).toBe(415)
    expect((await api('/api/roots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"path":""}' })).status).toBe(400)
    expect((await api('/api/nothing')).status).toBe(404)
  })

  it('exports a shareable snapshot with no home path, token or email', async () => {
    const res = await api('/api/export')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const text = await res.text()
    expect(text).not.toContain(fixture.home)
    expect(text).not.toContain(GH_TOKEN)
    expect(text).not.toContain('secret@example.com')
    const snap = JSON.parse(text) as Snapshot
    expect(snap.meta.mode).toBe('shared')
    expect(snap.meta.homeDir).toBe('~')
    const anon = (await (await api('/api/export?anonymize=1')).json()) as Snapshot
    expect(anon.meta.redaction).toBe('anonymized')
    expect(JSON.stringify(anon)).not.toContain('dev/app')
  })

  it('streams a hello event over SSE and triggers rescans', async () => {
    const controller = new AbortController()
    const res = await api('/api/events', { signal: controller.signal })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body?.getReader()
    const chunk = await reader?.read()
    const text = new TextDecoder().decode(chunk?.value)
    expect(text).toContain('"type":"hello"')
    controller.abort()
    const rescan = await api('/api/rescan?wait=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(rescan.status).toBe(200)
    const snap = (await rescan.json()) as Snapshot
    expect(snap.meta.snapshotId).toBeTruthy()
  })

  it('serves the web app with SPA fallback and blocks traversal', async () => {
    expect((await api('/')).status).toBe(200)
    expect((await api('/some/client/route')).status).toBe(200)
    const asset = await api('/assets/app-abc123.js')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect((await api('/missing.png')).status).toBe(404)
  })
})
