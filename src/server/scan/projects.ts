// Project discovery (registry, transcripts, history, roots) and per-project configuration scanning.
import { idOf } from '../../shared/ids.js'
import type { ProjectData, ProjectSource } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import type { ClaudeJsonResult, ProjectRegistryEntry } from './claudeJson.js'
import { scanAgentsDir, scanCommandsDir, scanOutputStylesDir, scanSkillsDir } from './components.js'
import type { ScanContext } from './context.js'
import { dirExists, fileExists, readJsonConfig } from './files.js'
import { readFirstLines, readTextCapped, readdirSorted, realpathSafe, statSafe, walkDirs } from './fsx.js'
import { findAncestorClaudeMds, scanClaudeMd, scanRulesDir } from './instructions.js'
import { emitMcpServer } from './mcp.js'
import { basenameOf, dirnameOf, encodeProjectDir, isUnder, joinPath, normalizePath, pathKey } from './paths.js'
import { buildPermissionNodes } from './permissions.js'
import { scanSettingsFile } from './settings.js'

export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'venv', '.venv', 'target', 'vendor', 'coverage', '__pycache__', '.cache', '.claude'])

export interface ProjectCandidate {
  /** Normalized, real-cased path. */
  path: string
  key: string
  sources: Set<ProjectSource>
  registryKeys: string[]
  registry?: ProjectRegistryEntry
  /** Names under ~/.claude/projects that belong to this project. */
  encodedDirs: string[]
  worktrees: string[]
  node?: Node<'project'>
}

export interface ProjectDiscovery {
  candidates: ProjectCandidate[]
  byKey: Map<string, ProjectCandidate>
  /** ~/.claude/projects entries that could not be mapped to any folder. */
  unmatchedProjectDirs: string[]
}

const WORKTREE_RE = /^(.*)\/\.claude\/worktrees\/([^/]+)(?:\/.*)?$/

export async function discoverProjects(ctx: ScanContext, registry: ClaudeJsonResult, historyByProject: Record<string, number>): Promise<ProjectDiscovery> {
  const byKey = new Map<string, ProjectCandidate>()
  const add = (raw: string, source: ProjectSource, entry?: ProjectRegistryEntry): ProjectCandidate | undefined => {
    const normalized = normalizePath(raw, ctx.env.platform)
    if (normalized === '' || normalized === '.') return undefined
    const wt = normalized.match(WORKTREE_RE)
    if (wt) {
      const parent = add(wt[1] ?? normalized, source)
      if (parent && wt[2] && !parent.worktrees.includes(wt[2])) parent.worktrees.push(wt[2])
      return parent
    }
    const key = pathKey(normalized, ctx.env.platform)
    let c = byKey.get(key)
    if (!c) {
      c = { path: normalized, key, sources: new Set(), registryKeys: [], encodedDirs: [], worktrees: [] }
      byKey.set(key, c)
    }
    c.sources.add(source)
    if (entry) {
      c.registry ??= entry
      c.registryKeys.push(entry.rawKey)
    }
    return c
  }

  for (const e of registry.entries) add(e.rawKey, 'claudeJson', e)
  for (const p of Object.keys(historyByProject)) add(p, 'history')
  for (const paths of Object.values(registry.githubRepoPaths)) for (const p of paths) add(p, 'github')

  // ~/.claude/projects/<encoded>: match encodings of known paths, otherwise peek at transcripts for cwd.
  const projectsDir = joinPath(ctx.paths.configDir, 'projects')
  const fold = (s: string) => (ctx.env.platform === 'win32' ? s.toLowerCase() : s)
  const encodings = new Map<string, ProjectCandidate>()
  for (const c of byKey.values()) {
    encodings.set(fold(encodeProjectDir(c.path)), c)
    for (const k of c.registryKeys) encodings.set(fold(encodeProjectDir(k)), c)
  }
  const unmatchedProjectDirs: string[] = []
  for (const e of await readdirSorted(projectsDir)) {
    if (!e.isDirectory()) continue
    const dir = joinPath(projectsDir, e.name)
    let c = encodings.get(fold(e.name))
    if (!c) {
      const cwd = await peekTranscriptCwd(dir)
      if (cwd) c = add(cwd, 'transcripts')
    }
    if (c) c.encodedDirs.push(e.name)
    else unmatchedProjectDirs.push(dir)
  }

  for (const root of ctx.env.roots) {
    const rootPath = normalizePath(root, ctx.env.platform)
    if (!(await dirExists(rootPath))) {
      ctx.b.warn({ code: 'roots.missing', severity: 'warn', message: `--root ${root} does not exist or is not a directory`, path: rootPath })
      continue
    }
    for await (const d of walkDirs(rootPath, { maxDepth: ctx.opts.depth, skipDirs: SKIP_DIRS, maxEntries: 20000 })) {
      const names = new Set(d.entries.map((x) => x.name))
      if (names.has('CLAUDE.md') || names.has('.claude') || names.has('.mcp.json') || names.has('CLAUDE.local.md')) add(d.path, 'rootScan')
    }
  }

  // Canonical casing from the file system where the folder exists.
  for (const c of byKey.values()) {
    const real = await realpathSafe(c.path)
    if (real) c.path = normalizePath(real, ctx.env.platform)
  }
  const candidates = Array.from(byKey.values()).sort((a, b) => a.path.localeCompare(b.path))
  return { candidates, byKey, unmatchedProjectDirs }
}

/** Newest few transcripts in a projects dir; returns the first `cwd` found within the first 50 records. */
export async function peekTranscriptCwd(dir: string): Promise<string | undefined> {
  const files = (await readdirSorted(dir)).filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
  const stamped: { name: string; mtime: number }[] = []
  for (const f of files) {
    const st = await statSafe(joinPath(dir, f.name))
    if (st) stamped.push({ name: f.name, mtime: st.mtimeMs })
  }
  stamped.sort((a, b) => b.mtime - a.mtime)
  for (const f of stamped.slice(0, 5)) {
    for (const line of await readFirstLines(joinPath(dir, f.name), { maxLines: 50, maxBytes: 64 * 1024 })) {
      try {
        const rec = JSON.parse(line) as { cwd?: unknown }
        if (typeof rec.cwd === 'string' && rec.cwd !== '') return rec.cwd
      } catch {
        // not JSON; keep looking
      }
    }
  }
  return undefined
}

export async function scanProjects(ctx: ScanContext, discovery: ProjectDiscovery): Promise<void> {
  const homeKey = pathKey(ctx.paths.home, ctx.env.platform)
  let done = 0
  for (const c of discovery.candidates) {
    done += 1
    ctx.progress('projects', done, discovery.candidates.length)
    const exists = await dirExists(c.path)
    const isHome = c.key === homeKey
    const data: ProjectData = {
      path: c.path,
      exists,
      isHome,
      sources: Array.from(c.sources),
      registryKeys: c.registryKeys,
      encodedDirName: c.encodedDirs[0],
      effective: { permissions: { allow: [], deny: [], ask: [] }, hooks: {}, env: {}, enabledPlugins: {} },
      worktreeCount: 0,
      sessionCount: 0,
      memoryFileCount: 0,
      lastCostUSD: c.registry?.data.lastCost,
      lastSessionId: c.registry?.data.lastSessionId,
    }
    const node = ctx.b.node({
      id: idOf('project', ctx.idPath(c.path)),
      kind: 'project',
      label: isHome ? '~ (home folder)' : basenameOf(c.path) || c.path,
      scope: 'project',
      layer: 'config',
      parentId: ctx.ids.machine,
      path: c.path,
      summary: '',
      data,
      flags: exists ? undefined : ['ghost'],
    })
    c.node = node
    if (!exists) {
      node.summary = `Claude Code remembers this folder (${c.path}) but it no longer exists; its state lingers in ~/.claude.json and ~/.claude/projects.`
      ctx.b.warn({ code: 'project.missing', severity: 'info', message: `project folder ${c.path} no longer exists`, path: c.path, nodeId: node.id })
    } else if (isHome) {
      node.summary = 'Claude was run directly in your home folder. Its configuration here is the user scope itself, so nothing project-specific applies.'
    } else {
      const otherProjects = discovery.candidates.filter((o) => o !== c).map((o) => o.path)
      await scanProjectConfig(ctx, node, c.path, false, otherProjects)
      const gitRemote = await readGitRemote(c.path)
      if (gitRemote) data.gitRemote = gitRemote
      for (const wt of c.worktrees) await scanWorktree(ctx, node, c.path, wt)
      const found = await listWorktrees(c.path)
      for (const wt of found) if (!c.worktrees.includes(wt)) await scanWorktree(ctx, node, c.path, wt)
      data.worktreeCount = ctx.b.childrenOf(node.id).filter((n) => n.kind === 'worktree').length
      node.summary = summarizeProject(ctx, node)
    }
    if (c.registry) emitProjectState(ctx, node, c)
  }
  linkNesting(ctx, discovery)
}

function summarizeProject(ctx: ScanContext, node: Node<'project'>): string {
  const kids = ctx.b.childrenOf(node.id)
  const count = (kind: string) => kids.filter((k) => k.kind === kind).length
  const parts: string[] = []
  const md = count('claudeMd')
  if (md > 0) parts.push(`${md} CLAUDE.md file${md === 1 ? '' : 's'}`)
  const settings = count('settings')
  if (settings > 0) parts.push(`${settings} settings file${settings === 1 ? '' : 's'}`)
  const mcp = kids.filter((k) => k.kind === 'mcpServer').length
  if (mcp > 0) parts.push(`${mcp} MCP server${mcp === 1 ? '' : 's'}`)
  const comps = count('skill') + count('agent') + count('command')
  if (comps > 0) parts.push(`${comps} skills/agents/commands`)
  const wt = count('worktree')
  if (wt > 0) parts.push(`${wt} worktree${wt === 1 ? '' : 's'}`)
  const via = node.data.sources.includes('claudeJson') ? 'Claude Code has run here' : `discovered via ${node.data.sources.join(', ')}`
  return `Project folder (${via})${parts.length > 0 ? `: ${parts.join(', ')}` : ': no project-level configuration'}. Its config applies only when Claude runs inside it.`
}

async function scanProjectConfig(ctx: ScanContext, owner: Node, root: string, isWorktree: boolean, otherProjects: string[] = []): Promise<void> {
  const claudeDir = joinPath(root, '.claude')
  await scanSettingsFile(ctx, joinPath(claudeDir, 'settings.json'), 'project', owner.id, 'project')
  await scanSettingsFile(ctx, joinPath(claudeDir, 'settings.local.json'), 'local', owner.id, 'project')

  const role = isWorktree ? 'worktree' : 'project'
  const rootMd = joinPath(root, 'CLAUDE.md')
  const dotMd = joinPath(claudeDir, 'CLAUDE.md')
  const hasRoot = await fileExists(rootMd)
  const hasDot = await fileExists(dotMd)
  if (hasRoot) await scanClaudeMd(ctx, rootMd, { role, parentId: owner.id, scope: 'project', projectRoot: root })
  if (hasDot) await scanClaudeMd(ctx, dotMd, { role, parentId: owner.id, scope: 'project', projectRoot: root })
  if (hasRoot && hasDot) ctx.b.warn({ code: 'claudeMd.duplicate', severity: 'warn', message: `${root} has both CLAUDE.md and .claude/CLAUDE.md; both are loaded`, path: root, nodeId: owner.id })
  await scanClaudeMd(ctx, joinPath(root, 'CLAUDE.local.md'), { role: 'local', parentId: owner.id, scope: 'project', projectRoot: root })
  if (await dirExists(joinPath(claudeDir, 'rules'))) await scanRulesDir(ctx, joinPath(claudeDir, 'rules'), owner.id, 'project')

  if (isWorktree) return

  // Ancestor CLAUDE.md files load at launch too; they belong to the ancestor project when that folder is one.
  for (const abs of await findAncestorClaudeMds(ctx, root)) {
    const ancestorDir = basenameOf(dirnameOf(abs)) === '.claude' ? dirnameOf(dirnameOf(abs)) : dirnameOf(abs)
    const ancestorProject = ctx.b.get(idOf('project', ctx.idPath(ancestorDir)))
    const md = await scanClaudeMd(ctx, abs, { role: 'parent', parentId: ancestorProject?.id ?? ctx.ids.machine, scope: 'project' })
    if (md) ctx.b.edge({ kind: 'loadsAtStartup', source: owner.id, target: md.id, label: 'parent folder', data: { reason: 'CLAUDE.md files in parent folders load at launch' } })
  }
  // Nested CLAUDE.md files load lazily when Claude works in that subfolder. Subfolders that are projects in their
  // own right keep their files (they are scanned as project files, not as this project's nested files).
  for await (const d of walkDirs(root, { maxDepth: 4, skipDirs: SKIP_DIRS, maxEntries: 2000 })) {
    if (d.depth === 0) continue
    if (otherProjects.some((p) => isUnder(d.path, p, ctx.env.platform) && !isUnder(root, p, ctx.env.platform))) continue
    if (d.entries.some((e) => e.isFile() && e.name === 'CLAUDE.md')) {
      const md = await scanClaudeMd(ctx, joinPath(d.path, 'CLAUDE.md'), { role: 'nested', parentId: owner.id, scope: 'project', projectRoot: root })
      if (md && md.data.role === 'nested') ctx.b.edge({ kind: 'loadsLazily', source: owner.id, target: md.id, label: 'subfolder', data: { reason: 'loaded only when Claude reads files in that folder' } })
    }
  }

  const compOwner = { parentId: owner.id, scope: 'project' as const, origin: 'project' as const }
  if (await dirExists(joinPath(claudeDir, 'agents'))) await scanAgentsDir(ctx, joinPath(claudeDir, 'agents'), compOwner)
  if (await dirExists(joinPath(claudeDir, 'skills'))) await scanSkillsDir(ctx, joinPath(claudeDir, 'skills'), compOwner)
  if (await dirExists(joinPath(claudeDir, 'commands'))) await scanCommandsDir(ctx, joinPath(claudeDir, 'commands'), compOwner)
  if (await dirExists(joinPath(claudeDir, 'output-styles'))) await scanOutputStylesDir(ctx, joinPath(claudeDir, 'output-styles'), owner.id, 'project')

  const mcpPath = joinPath(root, '.mcp.json')
  if (await fileExists(mcpPath)) {
    const cfg = await readJsonConfig(ctx, mcpPath, { intendedKind: 'project MCP servers', scope: 'project', parentId: owner.id })
    const servers = cfg && cfg.value.mcpServers && typeof cfg.value.mcpServers === 'object' ? (cfg.value.mcpServers as Record<string, unknown>) : {}
    for (const [name, raw] of Object.entries(servers)) {
      const server = emitMcpServer(ctx, { name, raw, scopeKind: 'project', parentId: owner.id, fileIdPath: ctx.idPath(mcpPath), path: mcpPath, scope: 'project' })
      server.data.approval = 'pending'
    }
  }

  const launchPath = joinPath(claudeDir, 'launch.json')
  if (await fileExists(launchPath)) {
    const cfg = await readJsonConfig(ctx, launchPath, { intendedKind: 'launch configuration', scope: 'project', parentId: owner.id })
    if (cfg) {
      const configs = Array.isArray(cfg.value.configurations) ? cfg.value.configurations : []
      const summarized = configs.map((c) => {
        const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
        return { name: typeof o.name === 'string' ? o.name : 'unnamed', type: typeof o.type === 'string' ? o.type : undefined, port: typeof o.port === 'number' ? o.port : undefined, runtimeExecutable: typeof o.runtimeExecutable === 'string' ? o.runtimeExecutable : undefined }
      })
      ctx.b.node({
        id: idOf('launchConfig', ctx.idPath(launchPath)),
        kind: 'launchConfig',
        label: 'launch.json',
        scope: 'project',
        layer: 'config',
        parentId: owner.id,
        path: launchPath,
        fileId: cfg.entry.id,
        summary: `${summarized.length} launch configuration${summarized.length === 1 ? '' : 's'} for the Desktop/IDE preview panel (${summarized.map((c) => c.name).join(', ')}); not read by the terminal CLI.`,
        data: { version: typeof cfg.value.version === 'string' ? cfg.value.version : undefined, configurations: summarized },
        loadTiming: 'lazy',
      })
    }
  }

  if (await dirExists(joinPath(claudeDir, 'plugins'))) {
    ctx.b.warn({ code: 'project.pluginsDir', severity: 'info', message: `${claudeDir}/plugins exists; project-scoped plugin folders are not interpreted by claude-mri`, path: joinPath(claudeDir, 'plugins'), nodeId: owner.id })
  }
}

async function listWorktrees(root: string): Promise<string[]> {
  const dir = joinPath(root, '.claude', 'worktrees')
  if (!(await dirExists(dir))) return []
  return (await readdirSorted(dir)).filter((e) => e.isDirectory()).map((e) => e.name)
}

async function scanWorktree(ctx: ScanContext, project: Node<'project'>, root: string, name: string): Promise<void> {
  const wtPath = joinPath(root, '.claude', 'worktrees', name)
  if (!(await dirExists(wtPath))) return
  const id = idOf('worktree', ctx.idPath(wtPath))
  if (ctx.b.has(id)) return
  let gitdir: string | undefined
  const gitFile = await readTextCapped(joinPath(wtPath, '.git'), 4096)
  if (gitFile) gitdir = gitFile.text.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim()
  const node = ctx.b.node({
    id,
    kind: 'worktree',
    label: name,
    scope: 'project',
    layer: 'config',
    parentId: project.id,
    path: wtPath,
    summary: `Git worktree Claude created for a parallel task; it has its own checkout and may carry its own CLAUDE.md and settings.`,
    data: { name, gitdir },
  })
  await scanProjectConfig(ctx, node, wtPath, true)
  ctx.b.edge({ kind: 'sameProjectAs', source: node.id, target: project.id, label: 'worktree of' })
}

async function readGitRemote(root: string): Promise<string | undefined> {
  const cfg = await readTextCapped(joinPath(root, '.git', 'config'), 64 * 1024)
  if (!cfg) return undefined
  const section = cfg.text.match(/\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/)
  return section?.[1]?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim()
}

/** The ~/.claude.json entry for a project: trust, approvals, local MCP servers, legacy allowedTools, last-session stats. */
function emitProjectState(ctx: ScanContext, project: Node<'project'>, c: ProjectCandidate): void {
  const entry = c.registry
  if (!entry) return
  const claudeJsonIdPath = ctx.idPath(ctx.paths.claudeJsonPath)
  const projectIdPath = ctx.idPath(c.path)
  const node = ctx.b.node({
    id: idOf('projectState', claudeJsonIdPath, projectIdPath),
    kind: 'projectState',
    label: 'state in ~/.claude.json',
    scope: 'local',
    layer: 'config',
    parentId: project.id,
    path: ctx.paths.claudeJsonPath,
    fileId: claudeJsonIdPath,
    summary: `What Claude Code remembers about this folder: ${entry.data.hasTrustDialogAccepted ? 'trusted' : 'trust not yet accepted'}, ${Object.keys(entry.localMcpRaw).length} local MCP server${Object.keys(entry.localMcpRaw).length === 1 ? '' : 's'}, ${entry.data.enabledMcpjsonServers.length} approved and ${entry.data.disabledMcpjsonServers.length} rejected .mcp.json server${entry.data.disabledMcpjsonServers.length === 1 ? '' : 's'}${entry.data.lastCost !== undefined ? `, last session cost $${entry.data.lastCost.toFixed(2)}` : ''}.`,
    data: entry.data,
  })
  for (const [name, raw] of Object.entries(entry.localMcpRaw)) {
    emitMcpServer(ctx, { name, raw, scopeKind: 'local', parentId: project.id, fileIdPath: claudeJsonIdPath, path: ctx.paths.claudeJsonPath, scope: 'local', idFragment: `${projectIdPath}/${name}` })
  }
  if (entry.data.allowedTools.length > 0) buildPermissionNodes(ctx, node, { allow: entry.data.allowedTools }, 'local', true)
  const projectServers = ctx.b.childrenOf(project.id).filter((n): n is Node<'mcpServer'> => n.kind === 'mcpServer' && (n as Node<'mcpServer'>).data.scopeKind === 'project')
  for (const s of projectServers) {
    if (entry.data.enabledMcpjsonServers.includes(s.data.name)) {
      s.data.approval = 'enabled'
      ctx.b.edge({ kind: 'approves', source: node.id, target: s.id, label: 'approved' })
    } else if (entry.data.disabledMcpjsonServers.includes(s.data.name)) {
      s.data.approval = 'disabled'
      ctx.b.addFlag(s.id, 'disabled')
      ctx.b.edge({ kind: 'rejects', source: node.id, target: s.id, label: 'rejected' })
    }
  }
  const canonicalKey = pathKey(c.path, ctx.env.platform)
  if (c.registryKeys.some((k) => pathKey(k, ctx.env.platform) !== canonicalKey || k !== c.path)) {
    ctx.b.edge({ kind: 'sameProjectAs', source: node.id, target: project.id, label: 'spelled differently', data: { reason: `registry key(s) ${c.registryKeys.join(', ')} refer to ${c.path}` } })
  }
}

/** project -> nearest ancestor project. */
function linkNesting(ctx: ScanContext, discovery: ProjectDiscovery): void {
  for (const c of discovery.candidates) {
    if (!c.node) continue
    let best: ProjectCandidate | undefined
    for (const other of discovery.candidates) {
      if (other === c || !other.node) continue
      if (isUnder(c.path, other.path, ctx.env.platform) && (!best || other.path.length > best.path.length)) best = other
    }
    // Being inside the home folder (when Claude was once run there) tells a newcomer nothing, so skip that edge.
    if (best?.node && !best.node.data.isHome) ctx.b.edge({ kind: 'nestedIn', source: c.node.id, target: best.node.id, label: 'inside', data: { reason: 'the parent folder is also a project; its CLAUDE.md files load here too' } })
  }
}
