// Optional enrichment from the `claude` CLI: version, installed plugin list, marketplaces, per-plugin token costs.
// Files on disk remain the source of truth; the CLI only adds stats and confirmation flags. Never throws.
import { execFile } from 'node:child_process'
import type { ScanContext } from '../scan/context.js'
import type { ScanEnv } from '../scan/env.js'
import { statSafe } from '../scan/fsx.js'
import { emitMcpServer } from '../scan/mcp.js'
import { joinPath, normalizePath } from '../scan/paths.js'

const TIMEOUT_MS = 15_000
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')

export interface CliPlugin {
  id: string
  version?: string
  scope?: string
  enabled?: boolean
  installPath?: string
  mcpServers?: Record<string, unknown>
  notes?: string[]
  projectEnabled?: boolean
  hasUserConfig?: boolean
}

export interface CliMarketplace {
  name: string
  source?: string
  repo?: string
  url?: string
  installLocation?: string
}

export interface PluginDetails {
  name?: string
  version?: string
  description?: string
  source?: string
  inventory: Record<string, { count: number; names: string[] }>
  tokensAlwaysOn?: number
  components: { name: string; alwaysOn?: number; onInvoke?: number }[]
  parsedRows: number
}

export interface CliEnrichment {
  available: boolean
  binary?: string
  version?: string
  plugins?: CliPlugin[]
  marketplaces?: CliMarketplace[]
  details: Map<string, PluginDetails>
  errors: string[]
}

export async function findClaudeBinary(env: ScanEnv): Promise<string | null> {
  const pathVar = env.env.PATH ?? env.env.Path ?? ''
  const sep = env.platform === 'win32' ? ';' : ':'
  const names = env.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude.bat', 'claude'] : ['claude']
  for (const dir of pathVar.split(sep)) {
    if (dir.trim() === '') continue
    for (const name of names) {
      const candidate = joinPath(normalizePath(dir, env.platform), name)
      const st = await statSafe(candidate)
      if (st?.isFile()) return candidate
    }
  }
  return null
}

export interface RunResult {
  ok: boolean
  stdout: string
  error?: string
}

export function runClaude(bin: string, args: string[], env: ScanEnv, configDir?: string): Promise<RunResult> {
  const childEnv: NodeJS.ProcessEnv = { ...env.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  if (configDir) childEnv.CLAUDE_CONFIG_DIR = configDir
  // .cmd/.bat shims need cmd.exe; pass the whole command line verbatim instead of shell:true (which concatenates args unsafely).
  const shim = env.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  const file = shim ? (env.env.ComSpec ?? 'cmd.exe') : bin
  const fileArgs = shim ? ['/d', '/s', '/c', `"${bin}" ${args.join(' ')}`] : args
  return new Promise((resolve) => {
    execFile(file, fileArgs, { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true, windowsVerbatimArguments: shim, env: childEnv }, (err, stdout) => {
      const out = String(stdout ?? '').replace(ANSI_RE, '')
      if (err) resolve({ ok: false, stdout: out, error: err.message })
      else resolve({ ok: true, stdout: out })
    })
  })
}

export function parseTok(raw: string): number | undefined {
  const m = raw.trim().match(/^~?([\d.,]+)\s*([kKmM])?$/)
  if (!m) return undefined
  const n = Number((m[1] ?? '').replaceAll(',', ''))
  if (!Number.isFinite(n)) return undefined
  const unit = (m[2] ?? '').toLowerCase()
  return Math.round(unit === 'k' ? n * 1000 : unit === 'm' ? n * 1_000_000 : n)
}

const SECTION_RE = /^\s{2}(Skills|Agents|Commands|Hooks|MCP servers|LSP servers|Output styles)\s+\((\d+)\)\s*(.*)$/
const ROW_RE = /^\s{2}(\S.*?)\s{2,}(\S+)\s+(\S+)\s*$/

/** Line-oriented parser for `claude plugin details <name>`; unknown lines are ignored so format drift degrades gracefully. */
export function parsePluginDetails(text: string): PluginDetails {
  const out: PluginDetails = { inventory: {}, components: [], parsedRows: 0 }
  let inTable = false
  const lines = text.replace(ANSI_RE, '').split(/\r?\n/)
  const first = lines.find((l) => l.trim() !== '')
  const header = first?.match(/^(\S+)\s+(\d[\w.+-]*)\s*$/)
  if (header) {
    out.name = header[1]
    out.version = header[2]
  }
  for (const line of lines) {
    const meta = line.match(/^\s{2}(Description|Source):\s*(.*)$/)
    if (meta) {
      if (meta[1] === 'Description') out.description = meta[2]
      else out.source = meta[2]
      continue
    }
    const section = line.match(SECTION_RE)
    if (section) {
      const rest = (section[3] ?? '').replace(/\s*\([^()]*\)\s*$/, '').trim()
      out.inventory[section[1] ?? ''] = { count: Number(section[2]), names: rest === '' ? [] : rest.split(/,\s*/).filter((n) => n !== '') }
      continue
    }
    const always = line.match(/^\s{2}Always-on:\s+~?([\d,]+)\s*tok/)
    if (always) {
      out.tokensAlwaysOn = Number((always[1] ?? '').replaceAll(',', ''))
      continue
    }
    if (/^\s*component\s+always-on\s+on-invoke\s*$/.test(line)) {
      inTable = true
      continue
    }
    if (!inTable) continue
    if (line.trim() === '') continue
    const row = line.match(ROW_RE)
    if (!row) continue
    out.components.push({ name: row[1] ?? '', alwaysOn: parseTok(row[2] ?? ''), onInvoke: parseTok(row[3] ?? '') })
    out.parsedRows += 1
  }
  return out
}

function parseJsonArray<T>(text: string): T[] | undefined {
  const start = text.indexOf('[')
  if (start < 0) return undefined
  try {
    const v = JSON.parse(text.slice(start)) as unknown
    return Array.isArray(v) ? (v as T[]) : undefined
  } catch {
    return undefined
  }
}

export interface EnrichmentHandle {
  /** Call after plugins are known so per-plugin details can be requested. */
  requestDetails(pluginNames: string[]): void
  result(): Promise<CliEnrichment>
}

/** Starts the cheap CLI calls immediately; `requestDetails` adds the per-plugin calls once plugin names are known. */
export function startEnrichment(env: ScanEnv, configDirOverride: string | undefined): EnrichmentHandle {
  const enrichment: CliEnrichment = { available: false, details: new Map(), errors: [] }
  let detailNames: string[] = []
  let detailsRequested: (() => void) | null = null
  const namesReady = new Promise<void>((resolve) => {
    detailsRequested = resolve
  })
  const work = (async () => {
    const bin = await findClaudeBinary(env)
    if (!bin) return enrichment
    enrichment.available = true
    enrichment.binary = bin
    const [version, list, markets] = await Promise.all([
      runClaude(bin, ['--version'], env, configDirOverride),
      runClaude(bin, ['plugin', 'list', '--json'], env, configDirOverride),
      runClaude(bin, ['plugin', 'marketplace', 'list', '--json'], env, configDirOverride),
    ])
    if (version.ok) enrichment.version = version.stdout.match(/(\d+\.\d+\.\d+)/)?.[1]
    else enrichment.errors.push(`claude --version: ${version.error ?? 'failed'}`)
    if (list.ok) enrichment.plugins = parseJsonArray<CliPlugin>(list.stdout) ?? []
    else enrichment.errors.push(`claude plugin list: ${list.error ?? 'failed'}`)
    if (markets.ok) enrichment.marketplaces = parseJsonArray<CliMarketplace>(markets.stdout) ?? []
    else enrichment.errors.push(`claude plugin marketplace list: ${markets.error ?? 'failed'}`)
    await namesReady
    for (const name of detailNames.slice(0, 20)) {
      const res = await runClaude(bin, ['plugin', 'details', name], env, configDirOverride)
      if (!res.ok) {
        enrichment.errors.push(`claude plugin details ${name}: ${res.error ?? 'failed'}`)
        continue
      }
      enrichment.details.set(name, parsePluginDetails(res.stdout))
    }
    return enrichment
  })()
  return {
    requestDetails(names) {
      detailNames = names
      detailsRequested?.()
    },
    result: () => work.catch((err: unknown) => ({ ...enrichment, errors: [...enrichment.errors, err instanceof Error ? err.message : String(err)] })),
  }
}

/** Folds CLI results into the graph. File-derived nodes stay authoritative; the CLI adds stats and flags. */
export function mergeEnrichment(ctx: ScanContext, e: CliEnrichment): void {
  for (const msg of e.errors) ctx.b.warn({ code: 'cli.failed', severity: 'info', message: msg })
  const plugins = ctx.b.byKind('plugin')
  for (const cp of e.plugins ?? []) {
    const node = plugins.find((p) => p.data.id === cp.id && !p.data.orphan && (cp.version === undefined || p.data.version === cp.version)) ?? plugins.find((p) => p.data.id === cp.id && !p.data.orphan)
    if (!node) continue
    node.data.cli = { enabled: cp.enabled ?? false, notes: cp.notes ?? [], projectEnabled: cp.projectEnabled ?? false, hasUserConfig: cp.hasUserConfig ?? false }
    if (cp.enabled !== undefined && node.data.enabledInSettings !== undefined && cp.enabled !== node.data.enabledInSettings) {
      ctx.b.warn({ code: 'cli.enablementMismatch', severity: 'info', message: `claude reports ${cp.id} enabled=${cp.enabled}, settings files say ${node.data.enabledInSettings}`, nodeId: node.id })
    }
    const servers = ctx.b.byKind('mcpServer').filter((s) => s.data.pluginId === cp.id)
    for (const [name, raw] of Object.entries(cp.mcpServers ?? {})) {
      const existing = servers.find((s) => s.data.name === name)
      if (existing) existing.data.cliConfirmed = true
      else {
        const created = emitMcpServer(ctx, { name, raw, scopeKind: 'plugin', parentId: node.id, fileIdPath: `${ctx.idPath(node.data.installPath)}/cli`, path: node.data.installPath, scope: 'plugin', pluginName: node.data.name, pluginId: cp.id })
        ctx.b.addFlag(created.id, 'cliOnly')
        created.data.cliConfirmed = true
      }
    }
  }
  for (const m of e.marketplaces ?? []) {
    const node = ctx.b.byKind('marketplace').find((n) => n.data.name === m.name)
    if (node && !node.data.installLocation && m.installLocation) node.data.installLocation = normalizePath(m.installLocation, ctx.env.platform)
  }
  for (const [name, d] of e.details) {
    const node = plugins.find((p) => p.data.name === name && !p.data.orphan)
    if (!node) continue
    if (d.tokensAlwaysOn !== undefined) node.stats = { ...node.stats, tokensAlwaysOn: d.tokensAlwaysOn }
    const fileCounts = node.data.counts
    const cliSkills = d.inventory.Skills?.count
    if (cliSkills !== undefined && cliSkills !== fileCounts.skills + fileCounts.commands && cliSkills !== fileCounts.skills) {
      ctx.b.warn({ code: 'cli.countMismatch', severity: 'info', message: `claude counts ${cliSkills} skills for ${name}; files show ${fileCounts.skills} skills and ${fileCounts.commands} commands`, nodeId: node.id })
    }
    const skills = ctx.b.byKind('skill').filter((s) => s.data.pluginId === node.data.id)
    const commands = ctx.b.byKind('command').filter((c) => c.data.pluginId === node.data.id)
    const agents = ctx.b.byKind('agent').filter((a) => a.data.pluginId === node.data.id)
    const unmatched: string[] = []
    for (const row of d.components) {
      const skillHits = skills.filter((s) => s.data.name === row.name)
      const commandHits = commands.filter((c) => c.data.name === row.name)
      const agentHits = agents.filter((a) => a.data.name === row.name)
      const hits = [...skillHits, ...commandHits, ...agentHits]
      if (hits.length === 0) {
        unmatched.push(row.name)
        continue
      }
      for (const h of hits) {
        h.stats = { ...h.stats, tokensAlwaysOn: row.alwaysOn, tokensOnInvoke: row.onInvoke }
        if (skillHits.length > 0 && commandHits.length > 0) (h.data as { statsAmbiguous?: boolean }).statsAmbiguous = true
      }
    }
    if (unmatched.length > 0) node.data.unmatchedComponents = unmatched
  }
}
