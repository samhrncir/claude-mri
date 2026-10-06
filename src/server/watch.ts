// Watches the config files a snapshot came from and reports changed paths, debounced, so the UI can offer a rescan.
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { Snapshot } from '../shared/snapshot.js'
import { dirnameOf, joinPath } from './scan/paths.js'

export type WatchHealth = 'active' | 'degraded' | 'off'

export interface Watcher {
  health: WatchHealth
  count: number
  close(): void
}

const MAX_WATCHERS = 300
const DEBOUNCE_MS = 500
const STATE_FILE_DEBOUNCE_MS = 3000
const INTERESTING = /(^|[\\/])(settings\.json|settings\.local\.json|CLAUDE\.md|CLAUDE\.local\.md|\.mcp\.json|keybindings\.json|\.claude\.json|installed_plugins\.json|known_marketplaces\.json|hooks\.json|plugin\.json|launch\.json|.*\.md)$/i

interface Target {
  path: string
  recursive: boolean
}

/** Which folders to watch, derived from where the snapshot's nodes live. */
export function watchTargets(snapshot: Snapshot): Target[] {
  const targets = new Map<string, Target>()
  const add = (path: string | undefined, recursive: boolean) => {
    if (!path) return
    const existing = targets.get(path)
    if (!existing || (recursive && !existing.recursive)) targets.set(path, { path, recursive })
  }
  const cfg = snapshot.meta.configDir
  add(cfg, false)
  add(dirnameOf(snapshot.meta.claudeJsonPath), false)
  add(joinPath(cfg, 'plugins'), false)
  for (const sub of ['skills', 'agents', 'commands', 'rules', 'output-styles', 'plans']) add(joinPath(cfg, sub), true)
  for (const n of snapshot.nodes) {
    if (n.kind === 'project' && n.path && !(n.data as { isHome?: boolean }).isHome && (n.data as { exists?: boolean }).exists) {
      add(n.path, false)
      add(joinPath(n.path, '.claude'), true)
    }
    if (n.kind === 'plugin' && n.path && (n.data as { installPathExists?: boolean }).installPathExists) {
      add(joinPath(n.path, 'hooks'), false)
      add(joinPath(n.path, '.claude-plugin'), false)
      add(n.path, false)
    }
    if (n.kind === 'managedScope' && n.path) add(n.path, true)
    if (n.kind === 'claudeDesktop' && n.path) add(n.path, false)
  }
  return Array.from(targets.values())
}

/**
 * ~/.claude.json is rewritten by Claude Code on almost every turn (usage counters, caches). Only the parts
 * that change the graph matter, so changes are reduced to a fingerprint of those keys.
 */
export async function fingerprintStateFile(path: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    const projects = raw.projects && typeof raw.projects === 'object' ? (raw.projects as Record<string, Record<string, unknown>>) : {}
    const relevant = {
      projects: Object.fromEntries(
        Object.entries(projects).map(([k, p]) => [k, { mcpServers: p?.mcpServers, enabledMcpjsonServers: p?.enabledMcpjsonServers, disabledMcpjsonServers: p?.disabledMcpjsonServers, allowedTools: p?.allowedTools, hasTrustDialogAccepted: p?.hasTrustDialogAccepted }]),
      ),
      mcpServers: raw.mcpServers,
      claudeAiMcpEverConnected: raw.claudeAiMcpEverConnected,
      githubRepoPaths: raw.githubRepoPaths,
    }
    return createHash('sha1').update(JSON.stringify(relevant)).digest('hex')
  } catch {
    return null
  }
}

export function createWatcher(snapshot: Snapshot, onChange: (paths: string[]) => void): Watcher {
  const watchers: FSWatcher[] = []
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null
  let stateTimer: NodeJS.Timeout | null = null
  let stateFingerprint: string | null | undefined
  const statePath = snapshot.meta.claudeJsonPath
  void fingerprintStateFile(statePath).then((fp) => {
    stateFingerprint = fp
  })

  const flush = () => {
    timer = null
    if (pending.size === 0) return
    const paths = Array.from(pending)
    pending.clear()
    onChange(paths)
  }
  const stateChanged = () => {
    stateTimer = null
    void fingerprintStateFile(statePath).then((fp) => {
      if (fp === stateFingerprint) return
      stateFingerprint = fp
      onChange([statePath])
    })
  }

  // Only folders that exist can be watched; optional ones (~/.claude/agents, rules, ...) are simply skipped.
  const targets = watchTargets(snapshot).filter((t) => existsSync(t.path))
  const limited = targets.slice(0, MAX_WATCHERS)
  let health: WatchHealth = targets.length > MAX_WATCHERS ? 'degraded' : 'active'
  for (const t of limited) {
    try {
      const w = watch(t.path, { recursive: t.recursive, persistent: false }, (_event, filename) => {
        const name = filename === null ? '' : String(filename).replaceAll('\\', '/')
        if (name !== '' && !INTERESTING.test(name)) return
        if (/(^|\/)worktrees\//.test(name) && !/(CLAUDE\.md|settings(\.local)?\.json)$/.test(name)) return
        const full = name === '' ? t.path : joinPath(t.path, name)
        if (/(^|\/)\.claude\.json$/.test(full)) {
          if (!stateTimer) stateTimer = setTimeout(stateChanged, STATE_FILE_DEBOUNCE_MS)
          return
        }
        pending.add(full)
        if (!timer) timer = setTimeout(flush, DEBOUNCE_MS)
      })
      w.on('error', () => {
        w.close()
        health = 'degraded'
      })
      watchers.push(w)
    } catch {
      health = 'degraded'
    }
  }
  if (watchers.length === 0) health = 'off'
  return {
    get health() {
      return health
    },
    count: watchers.length,
    close() {
      if (timer) clearTimeout(timer)
      if (stateTimer) clearTimeout(stateTimer)
      for (const w of watchers) w.close()
      watchers.length = 0
    },
  }
}
