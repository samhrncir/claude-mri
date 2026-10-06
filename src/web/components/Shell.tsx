// Header, empty state and the drag-and-drop loader for shared snapshots.
import { useCallback, useState, type ReactNode } from 'react'
import { loadDemo } from '../hooks/useBootstrap.js'
import { exportUrl, rescan } from '../lib/api.js'
import { relativeTime } from '../lib/format.js'
import { assertSnapshot } from '../lib/validate.js'
import { useAppStore } from '../store/index.js'
import { Icon } from './Icon.js'

export function Header({ onToggleRail }: { onToggleRail(): void }) {
  const snapshot = useAppStore((s) => s.snapshot)
  const mode = useAppStore((s) => s.mode)
  const status = useAppStore((s) => s.status)
  const progress = useAppStore((s) => s.scanProgress)
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const toast = useAppStore((s) => s.toast)
  const warnings = snapshot?.warnings.length ?? 0
  const meta = snapshot?.meta
  return (
    <header className="header">
      <button type="button" className="btn btn--ghost" onClick={onToggleRail} aria-label="Toggle filters" title="Filters">
        <Icon name="filter" />
      </button>
      <div className="header__brand">
        <Icon name="logo" />
        claude-mri
      </div>
      {meta ? (
        <div className="header__meta" title={meta.homeDir}>
          {meta.platform} · {meta.homeDir} · scanned {relativeTime(meta.scannedAt)} in {meta.durationMs} ms
          {meta.claudeVersion ? ` · Claude Code ${meta.claudeVersion}` : ''}
        </div>
      ) : null}
      {progress ? (
        <span className="chip">
          scanning {progress.phase} ({progress.done}/{progress.total})
        </span>
      ) : null}
      {mode === 'shared' ? <span className="banner">Viewing a shared snapshot from {meta?.platform}; paths are relative to its home folder</span> : null}
      {mode === 'demo' ? <span className="banner banner--demo">Demo data</span> : null}
      <div className="header__spacer" />
      {warnings > 0 ? (
        <span className="chip" title={`${warnings} warnings; see the Filters rail`}>
          <Icon name="warning" style={{ width: 12, height: 12, color: 'var(--warn)' }} /> {warnings}
        </span>
      ) : null}
      <button type="button" className="btn" onClick={() => setSearchOpen(true)} title="Search (Ctrl+K)">
        <Icon name="search" /> Search
      </button>
      {mode === 'local' && status === 'ready' ? (
        <>
          <button type="button" className="btn" onClick={() => void rescan().catch(() => toast('Rescan failed'))} title="Scan the machine again">
            <Icon name="rescan" /> Rescan
          </button>
          <a className="btn" href={exportUrl(false)} download title="Download a shareable snapshot (home paths and secrets removed)">
            <Icon name="export" /> Export
          </a>
          <a className="btn btn--ghost" href={exportUrl(true)} download title="Download an anonymized snapshot (project names hashed, personal notes dropped)">
            anonymized
          </a>
        </>
      ) : null}
    </header>
  )
}

export function EmptyState() {
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const load = useAppStore((s) => s.loadSnapshot)
  const toast = useAppStore((s) => s.toast)
  const demo = () => void loadDemo().then((snap) => load(snap, 'demo')).catch(() => toast('Could not load the demo'))
  return (
    <main className="empty">
      <div className="empty__card">
        <h2>{status === 'loading' ? 'Scanning…' : 'Nothing to show yet'}</h2>
        {status === 'loading' ? (
          <p>Reading your Claude Code configuration. This usually takes under a second.</p>
        ) : (
          <>
            <p>{error ?? 'Claude Code has not been installed or run for this user, so there is no configuration to map.'}</p>
            <p>
              Start the local server with <code>npx claude-mri</code>, drop a snapshot file exported from another machine onto this window, or explore the demo to see what the graph looks like.
            </p>
            <div className="empty__actions">
              <button type="button" className="btn btn--primary" onClick={demo}>
                Explore the demo
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export function DropZone({ children }: { children: ReactNode }) {
  const [over, setOver] = useState(false)
  const load = useAppStore((s) => s.loadSnapshot)
  const toast = useAppStore((s) => s.toast)
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setOver(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      file
        .text()
        .then((text) => load(assertSnapshot(JSON.parse(text)), 'shared'))
        .catch((err: unknown) => toast(`Not a claude-mri snapshot: ${err instanceof Error ? err.message : String(err)}`))
    },
    [load, toast],
  )
  return (
    <div
      style={{ height: '100%' }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {children}
      {over ? <div className="drop-overlay">Drop a claude-mri snapshot (.json)</div> : null}
    </div>
  )
}
