// Loads the snapshot from the local server, falls back to demo/shared modes, and listens for server events.
import { useEffect } from 'react'
import type { Snapshot } from '../../shared/snapshot.js'
import { fetchSnapshot, rescan, subscribeEvents } from '../lib/api.js'
import { assertSnapshot } from '../lib/validate.js'
import { useAppStore } from '../store/index.js'

export async function loadDemo(): Promise<Snapshot> {
  const mod = await import('../demo/demo-snapshot.json')
  return assertSnapshot(mod.default)
}

export function useBootstrap(): void {
  useEffect(() => {
    const store = useAppStore.getState()
    store.setStatus('loading')
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    void (async () => {
      try {
        const snap = await fetchSnapshot()
        if (cancelled) return
        useAppStore.getState().loadSnapshot(snap, 'local')
        unsubscribe = subscribeEvents((ev) => {
          const s = useAppStore.getState()
          switch (ev.type) {
            case 'scan-progress':
              s.setScanProgress({ phase: ev.phase, done: ev.done, total: ev.total })
              break
            case 'scan-done':
            case 'enrich-done':
              s.setScanProgress(undefined)
              void fetchSnapshot().then((fresh) => {
                if (fresh.meta.snapshotId !== useAppStore.getState().snapshot?.meta.snapshotId || ev.type === 'enrich-done') useAppStore.getState().loadSnapshot(fresh, 'local')
              })
              break
            case 'file-changed': {
              const names = ev.paths.map((p) => p.split('/').pop() ?? p)
              const unique = Array.from(new Set(names)).slice(0, 3).join(', ')
              s.toast(`${unique} changed on disk`, { label: 'Rescan', run: () => void rescan().catch(() => s.toast('Rescan failed')) })
              break
            }
            case 'scan-error':
              s.toast(`Scan failed: ${ev.message}`)
              break
            default:
              break
          }
        })
      } catch {
        if (cancelled) return
        useAppStore.getState().setStatus('empty', 'The local server is not reachable.')
      }
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])
}
