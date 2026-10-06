// Session transcripts (~/.claude/projects/<encoded>/*.jsonl) and the live process registry (~/.claude/sessions/*.json).
import { idOf } from '../../shared/ids.js'
import type { LiveSessionData, SessionData } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { addFile, dirExists, readJsonConfig } from './files.js'
import { readFirstLines, readTextCapped, readdirSorted, statSafe } from './fsx.js'
import { basenameOf, joinPath, normalizePath, pathKey } from './paths.js'
import type { ProjectDiscovery } from './projects.js'

const MAX_SESSIONS_PER_PROJECT = 50

interface Peek {
  cwd?: string
  gitBranch?: string
  version?: string
  firstTimestamp?: string
}

async function peekTranscript(abs: string): Promise<Peek> {
  const peek: Peek = {}
  for (const line of await readFirstLines(abs, { maxLines: 50, maxBytes: 64 * 1024 })) {
    try {
      const rec = JSON.parse(line) as Record<string, unknown>
      if (peek.cwd === undefined && typeof rec.cwd === 'string') peek.cwd = rec.cwd
      if (peek.gitBranch === undefined && typeof rec.gitBranch === 'string') peek.gitBranch = rec.gitBranch
      if (peek.version === undefined && typeof rec.version === 'string') peek.version = rec.version
      if (peek.firstTimestamp === undefined && typeof rec.timestamp === 'string') peek.firstTimestamp = rec.timestamp
      if (peek.cwd && peek.gitBranch && peek.version && peek.firstTimestamp) break
    } catch {
      // skip non-JSON lines
    }
  }
  return peek
}

async function countLinesDeep(abs: string): Promise<number | undefined> {
  const read = await readTextCapped(abs, 64 * 1024 * 1024)
  if (!read || read.truncated) return undefined
  let n = 0
  for (let i = 0; i < read.text.length; i += 1) if (read.text.charCodeAt(i) === 10) n += 1
  return n
}

/** Transcript metadata per project: counts for all, nodes for the 50 newest. Bodies are never read. */
export async function scanSessions(ctx: ScanContext, discovery: ProjectDiscovery): Promise<void> {
  const projectsDir = joinPath(ctx.paths.configDir, 'projects')
  for (const c of discovery.candidates) {
    if (!c.node) continue
    const all: { abs: string; name: string; mtimeMs: number; size: number }[] = []
    for (const enc of c.encodedDirs) {
      const dir = joinPath(projectsDir, enc)
      for (const e of await readdirSorted(dir)) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
        const abs = joinPath(dir, e.name)
        const st = await statSafe(abs)
        if (st) all.push({ abs, name: e.name, mtimeMs: st.mtimeMs, size: st.size })
      }
    }
    all.sort((a, b) => b.mtimeMs - a.mtimeMs)
    c.node.data.sessionCount = all.length
    if (all.length === 0) continue
    const newest = all[0]
    c.node.stats = { ...c.node.stats, sessionCount: all.length, lastSessionAt: newest ? new Date(newest.mtimeMs).toISOString() : undefined }
    for (const t of all.slice(0, MAX_SESSIONS_PER_PROJECT)) {
      const sessionId = t.name.replace(/\.jsonl$/, '')
      const sessionDir = joinPath(t.abs.slice(0, -t.name.length), sessionId)
      const subagents = (await dirExists(joinPath(sessionDir, 'subagents'))) ? (await readdirSorted(joinPath(sessionDir, 'subagents'))).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).length : 0
      const hasToolResults = await dirExists(joinPath(sessionDir, 'tool-results'))
      const peek = await peekTranscript(t.abs)
      const entry = addFile(ctx, t.abs, { size: t.size, mtimeMs: t.mtimeMs, kind: 'jsonl' })
      const data: SessionData = { sessionId, cwd: peek.cwd, gitBranch: peek.gitBranch, version: peek.version, firstTimestamp: peek.firstTimestamp, subagentCount: subagents, hasToolResults }
      const lines = ctx.opts.deepSessions ? await countLinesDeep(t.abs) : undefined
      ctx.b.node({
        id: idOf('session', ctx.idPath(t.abs)),
        kind: 'session',
        label: sessionId.slice(0, 8),
        scope: 'local',
        layer: 'sessions',
        parentId: c.node.id,
        path: t.abs,
        fileId: entry.id,
        summary: `Conversation transcript${peek.gitBranch ? ` on branch ${peek.gitBranch}` : ''}${peek.version ? ` (Claude Code ${peek.version})` : ''}${subagents > 0 ? `, ${subagents} subagent${subagents === 1 ? '' : 's'}` : ''}. Used by --resume and for rewinds; never read into this graph.`,
        data,
        stats: { sizeBytes: t.size, lines, lastUsedAt: new Date(t.mtimeMs).toISOString() },
        loadTiming: 'never',
      })
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** ~/.claude/sessions/<pid>.json: Claude Code processes that are (or were) running. */
export async function scanLiveSessions(ctx: ScanContext, discovery: ProjectDiscovery): Promise<void> {
  const dir = joinPath(ctx.paths.configDir, 'sessions')
  if (!(await dirExists(dir))) return
  const transcripts = ctx.b.byKind('session')
  const plugins = ctx.b.byKind('plugin')
  for (const e of await readdirSorted(dir)) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue // *.key files are never read
    const abs = joinPath(dir, e.name)
    const cfg = await readJsonConfig(ctx, abs, { intendedKind: 'live session record', scope: 'user', inline: false })
    if (!cfg) continue
    const v = cfg.value
    const pid = typeof v.pid === 'number' ? v.pid : Number(e.name.replace(/\.json$/, ''))
    if (!Number.isInteger(pid)) continue
    const cwd = typeof v.cwd === 'string' ? normalizePath(v.cwd, ctx.env.platform) : undefined
    const alive = isAlive(pid)
    const data: LiveSessionData = {
      pid,
      sessionId: typeof v.sessionId === 'string' ? v.sessionId : undefined,
      cwd,
      startedAt: typeof v.startedAt === 'number' ? v.startedAt : undefined,
      version: typeof v.version === 'string' ? v.version : undefined,
      name: typeof v.name === 'string' ? v.name : undefined,
      status: typeof v.status === 'string' ? v.status : undefined,
      kind: typeof v.kind === 'string' ? v.kind : undefined,
      entrypoint: typeof v.entrypoint === 'string' ? v.entrypoint : undefined,
      alive,
    }
    const project = cwd ? discovery.byKey.get(pathKey(cwd, ctx.env.platform))?.node : undefined
    const node = ctx.b.node({
      id: idOf('liveSession', ctx.idPath(abs)),
      kind: 'liveSession',
      label: `${data.name ?? 'session'} (pid ${pid})${alive ? '' : ', ended'}`,
      scope: 'user',
      layer: 'sessions',
      parentId: project?.id ?? ctx.ids.userScope,
      path: abs,
      fileId: cfg.entry.id,
      summary: alive
        ? `Claude Code process running right now${cwd ? ` in ${cwd}` : ''}${data.version ? ` (version ${data.version})` : ''}.`
        : `Record of a Claude Code process that has exited (pid ${pid}); Claude Code cleans these up over time.`,
      data,
      stats: { sizeBytes: cfg.entry.size },
      flags: alive ? undefined : ['ghost'],
      loadTiming: 'never',
    })
    if (project) ctx.b.edge({ kind: 'runsIn', source: node.id, target: project.id, label: 'running in' })
    if (data.sessionId) {
      const transcript = transcripts.find((t) => t.data.sessionId === data.sessionId)
      if (transcript) ctx.b.edge({ kind: 'writes', source: node.id, target: transcript.id, label: 'transcript' })
    }
    for (const p of plugins) if (p.data.heldByPids.includes(pid)) ctx.b.edge({ kind: 'holds', source: node.id, target: p.id, label: 'plugin in use' })
  }
}

export function sessionLabel(n: Node<'session'>): string {
  return basenameOf(n.path ?? n.id)
}
