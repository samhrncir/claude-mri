// ~/.claude (or $CLAUDE_CONFIG_DIR): settings, CLAUDE.md, rules, skills, agents, commands, styles, state residue.
import { idOf } from '../../shared/ids.js'
import type { Node } from '../../shared/snapshot.js'
import { STATE_DIRS } from '../../shared/vocab.js'
import { scanAgentsDir, scanCommandsDir, scanOutputStylesDir, scanSkillsDir } from './components.js'
import type { ScanContext } from './context.js'
import { addFile, dirExists, fileExists, readJsonConfig } from './files.js'
import { dirSummary, readFirstLines, readdirSorted, statSafe } from './fsx.js'
import { scanClaudeMd, scanRulesDir } from './instructions.js'
import { joinPath } from './paths.js'
import { scanSettingsFile } from './settings.js'

/** Config dirs handled by dedicated scanners; everything else under ~/.claude is runtime residue. */
const HANDLED_DIRS = new Set(['plugins', 'skills', 'agents', 'commands', 'rules', 'output-styles', 'projects', 'plans', 'sessions', 'hooks'])
const HANDLED_FILES = new Set(['settings.json', 'settings.local.json', 'CLAUDE.md', 'keybindings.json', '.credentials.json', 'history.jsonl'])

export async function scanUserScope(ctx: ScanContext): Promise<void> {
  const { configDir } = ctx.paths
  const exists = await dirExists(configDir)
  const id = ctx.ids.userScope
  ctx.b.node({
    id,
    kind: 'userScope',
    label: `You (${ctx.scoped(configDir)})`,
    scope: 'user',
    layer: 'config',
    parentId: ctx.ids.machine,
    path: configDir,
    summary: exists
      ? 'Your personal Claude Code configuration. Everything here applies to every project on this machine.'
      : 'No Claude Code configuration directory was found; Claude Code has not run for this user yet.',
    data: { exists },
    flags: exists ? undefined : ['missing'],
  })
  if (!exists) {
    ctx.b.warn({ code: 'user.missingConfigDir', severity: 'warn', message: `${configDir} does not exist`, path: configDir, nodeId: id })
    return
  }

  await scanSettingsFile(ctx, joinPath(configDir, 'settings.json'), 'user', id, 'user')
  await scanSettingsFile(ctx, joinPath(configDir, 'settings.local.json'), 'local', id, 'user')
  await scanClaudeMd(ctx, joinPath(configDir, 'CLAUDE.md'), { role: 'user', parentId: id, scope: 'user' })

  if (await dirExists(joinPath(configDir, 'rules'))) await scanRulesDir(ctx, joinPath(configDir, 'rules'), id, 'user')
  await scanUserSkills(ctx, joinPath(configDir, 'skills'))
  if (await dirExists(joinPath(configDir, 'agents'))) await scanAgentsDir(ctx, joinPath(configDir, 'agents'), { parentId: id, scope: 'user', origin: 'personal' })
  if (await dirExists(joinPath(configDir, 'commands'))) await scanCommandsDir(ctx, joinPath(configDir, 'commands'), { parentId: id, scope: 'user', origin: 'personal' })
  if (await dirExists(joinPath(configDir, 'output-styles'))) await scanOutputStylesDir(ctx, joinPath(configDir, 'output-styles'), id, 'user')

  await scanKeybindings(ctx, joinPath(configDir, 'keybindings.json'))
  await scanCredentialsMarker(ctx, joinPath(configDir, '.credentials.json'))
  await scanHistory(ctx, joinPath(configDir, 'history.jsonl'))
  await scanResidue(ctx, configDir)
}

async function scanUserSkills(ctx: ScanContext, skillsDir: string): Promise<void> {
  if (!(await dirExists(skillsDir))) return
  const id = ctx.ids.userScope
  await scanSkillsDir(ctx, skillsDir, { parentId: id, scope: 'user', origin: 'personal' })
  for (const e of await readdirSorted(skillsDir)) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    const sub = joinPath(skillsDir, e.name)
    if (await fileExists(joinPath(sub, 'SKILL.md'))) continue // already scanned as a personal skill
    if (e.name === 'synced') {
      for (const bucket of await readdirSorted(sub)) {
        if (!bucket.isDirectory() || bucket.name.startsWith('.')) continue
        await scanSyncedBucket(ctx, joinPath(sub, bucket.name), bucket.name)
      }
      continue
    }
    // Namespace folders such as skills/learned/<name>/SKILL.md.
    await scanSkillsDir(ctx, sub, { parentId: id, scope: 'user', origin: 'personal' })
  }
}

async function scanSyncedBucket(ctx: ScanContext, dir: string, bucket: string): Promise<void> {
  const [org, account] = bucket.split('_')
  const manifest = await readJsonConfig(ctx, joinPath(dir, 'manifest.json'), { intendedKind: 'synced skills manifest', scope: 'user', inline: false })
  const node = ctx.b.node({
    id: idOf('syncedBucket', ctx.idPath(dir)),
    kind: 'syncedBucket',
    label: 'claude.ai synced skills',
    scope: 'user',
    layer: 'config',
    parentId: ctx.ids.userScope,
    path: dir,
    summary: 'Skills synced from your claude.ai account; they appear as /anthropic-skills:<name> and update on their own.',
    data: { bucket, org, account, skillCount: 0, lastUpdated: typeof manifest?.value.lastUpdated === 'string' ? manifest.value.lastUpdated : undefined },
  })
  const skills = await scanSkillsDir(ctx, dir, { parentId: node.id, scope: 'user', origin: 'synced', bucket })
  node.data.skillCount = skills.length
  node.summary = `${skills.length} skill${skills.length === 1 ? '' : 's'} synced from your claude.ai account; they appear as /anthropic-skills:<name> and update on their own.`
}

async function scanKeybindings(ctx: ScanContext, abs: string): Promise<void> {
  const cfg = await readJsonConfig(ctx, abs, { intendedKind: 'keybindings', scope: 'user', parentId: ctx.ids.userScope })
  if (!cfg) return
  const bindings = Array.isArray(cfg.value.bindings) ? cfg.value.bindings : []
  let count = 0
  for (const b of bindings) {
    const inner = b && typeof b === 'object' ? (b as Record<string, unknown>).bindings : undefined
    if (inner && typeof inner === 'object') count += Object.keys(inner as object).length
  }
  ctx.b.node({
    id: idOf('keybindings', ctx.idPath(abs)),
    kind: 'keybindings',
    label: 'keybindings.json',
    scope: 'user',
    layer: 'config',
    parentId: ctx.ids.userScope,
    path: abs,
    fileId: cfg.entry.id,
    summary: `${count} custom terminal shortcut${count === 1 ? '' : 's'} (created with /keybindings).`,
    data: { bindingCount: count },
  })
}

async function scanCredentialsMarker(ctx: ScanContext, abs: string): Promise<void> {
  const st = await statSafe(abs)
  if (!st) return
  ctx.b.node({
    id: idOf('credentials', ctx.idPath(abs)),
    kind: 'credentials',
    label: '.credentials.json',
    scope: 'user',
    layer: 'state',
    parentId: ctx.ids.userScope,
    path: abs,
    summary: 'Your sign-in tokens. claude-mri never opens this file; it only notes that it exists.',
    data: { exists: true },
    stats: { sizeBytes: st.size },
  })
}

/** history.jsonl: prompt history. Only counts per project are kept; prompt text is never read into the snapshot. */
async function scanHistory(ctx: ScanContext, abs: string): Promise<void> {
  const st = await statSafe(abs)
  if (!st || !st.isFile()) return
  const entry = addFile(ctx, abs, { size: st.size, mtimeMs: st.mtimeMs, kind: 'jsonl' })
  const byProject: Record<string, number> = {}
  let lines = 0
  let firstTs: string | undefined
  let lastTs: string | undefined
  if (st.size <= 50 * 1024 * 1024) {
    for (const line of await readFirstLines(abs, { maxLines: 200000, maxBytes: 50 * 1024 * 1024 })) {
      lines += 1
      try {
        const rec = JSON.parse(line) as { project?: string; timestamp?: number }
        if (typeof rec.project === 'string') byProject[rec.project] = (byProject[rec.project] ?? 0) + 1
        if (typeof rec.timestamp === 'number') {
          const iso = new Date(rec.timestamp).toISOString()
          if (!firstTs || iso < firstTs) firstTs = iso
          if (!lastTs || iso > lastTs) lastTs = iso
        }
      } catch {
        // skip malformed lines
      }
    }
  } else {
    ctx.b.warn({ code: 'history.tooLarge', severity: 'info', message: `${abs} is larger than 50 MB; counts skipped`, path: abs })
  }
  ctx.b.node({
    id: idOf('logFile', ctx.idPath(abs)),
    kind: 'logFile',
    label: 'history.jsonl',
    scope: 'user',
    layer: 'sessions',
    parentId: ctx.ids.userScope,
    path: abs,
    fileId: entry.id,
    summary: `Your prompt history across all projects (${lines} entries). Used for the prompt picker; never read into this graph.`,
    data: { purpose: 'prompt history', byProject, firstTs, lastTs },
    stats: { sizeBytes: st.size, lines },
  })
}

/** Everything else under the config dir: known state dirs, logs, unknown folders. */
async function scanResidue(ctx: ScanContext, configDir: string): Promise<void> {
  for (const e of await readdirSorted(configDir)) {
    const abs = joinPath(configDir, e.name)
    if (e.isDirectory()) {
      if (HANDLED_DIRS.has(e.name)) continue
      const purpose = STATE_DIRS[e.name]
      const summary = await dirSummary(abs)
      const node: Node<'stateDir'> = {
        id: idOf('stateDir', ctx.idPath(abs)),
        kind: 'stateDir',
        label: `${e.name}/`,
        scope: 'user',
        layer: 'state',
        parentId: ctx.ids.userScope,
        path: abs,
        summary: purpose ? `${purpose}. ${summary.fileCount}${summary.shallow ? '+' : ''} files.` : `Folder not recognized by claude-mri (${summary.fileCount} files); possibly written by a plugin.`,
        data: { purpose: purpose ?? 'unknown', fileCount: summary.fileCount, totalBytes: summary.totalBytes, shallow: summary.shallow },
        stats: { fileCount: summary.fileCount, sizeBytes: summary.totalBytes },
      }
      ctx.b.node(node)
      if (!purpose) ctx.b.warn({ code: 'state.unknownDir', severity: 'info', message: `unrecognized folder ${abs}`, path: abs, nodeId: node.id })
      continue
    }
    if (!e.isFile() || HANDLED_FILES.has(e.name)) continue
    const lower = e.name.toLowerCase()
    if (lower.endsWith('.log') || lower.endsWith('.jsonl') || lower.startsWith('.last-') || lower === '.claude.json') {
      const st = await statSafe(abs)
      if (!st) continue
      const isState = lower.startsWith('.last-')
      ctx.b.node({
        id: idOf('logFile', ctx.idPath(abs)),
        kind: 'logFile',
        label: e.name,
        scope: 'user',
        layer: 'state',
        parentId: ctx.ids.userScope,
        path: abs,
        summary: isState ? 'Small state marker written by Claude Code.' : 'Log file, typically written by a plugin hook.',
        data: { purpose: isState ? 'state marker' : 'log' },
        stats: { sizeBytes: st.size },
      })
    }
  }
}
