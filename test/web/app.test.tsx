import { ReactFlowProvider } from '@xyflow/react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/web/App.js'
import { renderMarkdown } from '../../src/web/components/Inspector/MarkdownView.js'
import { useAppStore } from '../../src/web/store/index.js'
import demo from '../../src/web/demo/demo-snapshot.json'

vi.mock('elkjs/lib/elk-worker.min.js?worker', () => ({
  default: class FakeWorker {
    terminate() {}
  },
}))

class FakeEventSource {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, writable: true, configurable: true })
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
      writable: true,
      configurable: true,
    })
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/snapshot')) return new Response(JSON.stringify(demo), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response('{}', { status: 404 })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('<App />', () => {
  it('loads the snapshot from the server and renders the shell', async () => {
    render(
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>,
    )
    await waitFor(() => expect(useAppStore.getState().status).toBe('ready'))
    expect(screen.getByText('claude-mri')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Canvas tools' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Filters' })).toBeInTheDocument()
    await waitFor(() => expect(useAppStore.getState().rfNodes.length).toBeGreaterThan(5))
  })

  it('falls back to the empty state when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    render(
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>,
    )
    await waitFor(() => expect(useAppStore.getState().status).toBe('empty'))
    expect(screen.getByText('Explore the demo')).toBeInTheDocument()
  })

  it('sanitizes markdown from untrusted snapshots', () => {
    const html = renderMarkdown('# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://example.com)')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/href="javascript:/i)
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
