// ~/.claude.json: Claude Code's state file. Only an allowlist of keys is ever read into the snapshot.
import { cloudId, idOf } from '../../shared/ids.js'
import type { ModelUsage, ProjectStateData } from '../../shared/nodeData.js'
import type { ScanContext } from './context.js'
import { addFile } from './files.js'
import { readJsonFile } from './fsx.js'
import { connectorToolPrefix, emitMcpServer } from './mcp.js'
import { normalizePath } from './paths.js'
import { ensureMcpToolPrefix } from './tools.js'

export interface UsageEntry {
  usageCount?: number
  lastUsedAt?: string
}

export interface ProjectRegistryEntry {
  rawKey: string
  path: string
  data: ProjectStateData
  localMcpRaw: Record<string, unknown>
}

export interface ClaudeJsonResult {
  exists: boolean
  entries: ProjectRegistryEntry[]
  connectors: string[]
  pluginUsage: Record<string, UsageEntry>
  skillUsage: Record<string, UsageEntry>
  githubRepoPaths: Record<string, string[]>
}

const EXTRACTED_KEYS = ['projects', 'mcpServers', 'claudeAiMcpEverConnected', 'pluginUsage', 'skillUsage', 'githubRepoPaths', 'installMethod', 'numStartups', 'firstStartTime']

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function usageMap(v: unknown): Record<string, UsageEntry> {
  const out: Record<string, UsageEntry> = {}
  if (!isObj(v)) return out
  for (const [k, raw] of Object.entries(v)) {
    if (!isObj(raw)) continue
    out[k] = { usageCount: num(raw.usageCount), lastUsedAt: typeof raw.lastUsedAt === 'string' ? raw.lastUsedAt : undefined }
  }
  return out
}

export function extractProjectState(p: unknown): { data: ProjectStateData; localMcpRaw: Record<string, unknown> } {
  const o = isObj(p) ? p : {}
  const localMcpRaw = isObj(o.mcpServers) ? o.mcpServers : {}
  let lastModelUsage: Record<string, ModelUsage> | undefined
  if (isObj(o.lastModelUsage)) {
    lastModelUsage = {}
    for (const [model, u] of Object.entries(o.lastModelUsage)) {
      if (!isObj(u)) continue
      lastModelUsage[model] = { inputTokens: num(u.inputTokens) ?? 0, outputTokens: num(u.outputTokens) ?? 0, costUSD: num(u.costUSD) ?? 0 }
    }
  }
  return {
    data: {
      allowedTools: strings(o.allowedTools),
      enabledMcpjsonServers: strings(o.enabledMcpjsonServers),
      disabledMcpjsonServers: strings(o.disabledMcpjsonServers),
      mcpContextUris: strings(o.mcpContextUris),
      localMcpServers: Object.keys(localMcpRaw),
      hasTrustDialogAccepted: typeof o.hasTrustDialogAccepted === 'boolean' ? o.hasTrustDialogAccepted : undefined,
      hasClaudeMdExternalIncludesApproved: typeof o.hasClaudeMdExternalIncludesApproved === 'boolean' ? o.hasClaudeMdExternalIncludesApproved : undefined,
      lastCost: num(o.lastCost),
      lastDuration: num(o.lastDuration),
      lastSessionId: typeof o.lastSessionId === 'string' ? o.lastSessionId : undefined,
      lastModelUsage,
    },
    localMcpRaw,
  }
}

export async function scanClaudeJson(ctx: ScanContext): Promise<ClaudeJsonResult> {
  const abs = ctx.paths.claudeJsonPath
  const empty: ClaudeJsonResult = { exists: false, entries: [], connectors: [], pluginUsage: {}, skillUsage: {}, githubRepoPaths: {} }
  const res = await readJsonFile(abs, 32 * 1024 * 1024)
  if (!res.ok) {
    if (res.reason !== 'missing') ctx.b.warn({ code: 'claudeJson.unreadable', severity: 'warn', message: `${abs}: ${res.error}`, path: abs })
    else ctx.b.warn({ code: 'claudeJson.missing', severity: 'info', message: `${abs} not found; Claude Code has not been started for this user`, path: abs })
    return empty
  }
  const v = isObj(res.value) ? res.value : {}
  // Registered size-only: the server refuses to serve this file because it holds account details.
  const entry = addFile(ctx, abs, { size: res.size, mtimeMs: res.mtimeMs, kind: 'json' })

  const projects = isObj(v.projects) ? v.projects : {}
  const entries: ProjectRegistryEntry[] = Object.entries(projects).map(([rawKey, p]) => {
    const { data, localMcpRaw } = extractProjectState(p)
    return { rawKey, path: normalizePath(rawKey, ctx.env.platform), data, localMcpRaw }
  })
  const userMcp = isObj(v.mcpServers) ? v.mcpServers : {}
  const connectors = strings(v.claudeAiMcpEverConnected)
  const githubRepoPaths: Record<string, string[]> = {}
  if (isObj(v.githubRepoPaths)) for (const [repo, paths] of Object.entries(v.githubRepoPaths)) githubRepoPaths[repo] = strings(paths)

  const node = ctx.b.node({
    id: idOf('claudeJson', ctx.idPath(abs)),
    kind: 'claudeJson',
    label: '.claude.json',
    scope: 'user',
    layer: 'config',
    parentId: ctx.ids.userScope,
    path: abs,
    fileId: entry.id,
    summary: `Claude Code's state file (not settings.json): ${entries.length} project entries, ${Object.keys(userMcp).length} user-scope MCP server${Object.keys(userMcp).length === 1 ? '' : 's'}, ${connectors.length} claude.ai connector${connectors.length === 1 ? '' : 's'}, plus usage counters. Account details inside are never read by claude-mri.`,
    data: {
      keyCount: Object.keys(v).length,
      extractedKeys: EXTRACTED_KEYS.filter((k) => k in v),
      projectCount: entries.length,
      userMcpServers: Object.keys(userMcp),
      connectors,
      installMethod: typeof v.installMethod === 'string' ? v.installMethod : undefined,
      numStartups: num(v.numStartups),
      firstStartTime: typeof v.firstStartTime === 'string' ? v.firstStartTime : undefined,
    },
    stats: { sizeBytes: res.size },
  })

  for (const [name, raw] of Object.entries(userMcp)) {
    emitMcpServer(ctx, { name, raw, scopeKind: 'user', parentId: ctx.ids.userScope, fileIdPath: ctx.idPath(abs), path: abs, scope: 'user' })
  }

  if (connectors.length > 0) {
    ctx.b.node({
      id: ctx.ids.cloudConnectors,
      kind: 'cloudConnectors',
      label: 'claude.ai connectors',
      scope: 'cloud',
      layer: 'config',
      parentId: ctx.ids.machine,
      summary: `${connectors.length} remote MCP connector${connectors.length === 1 ? '' : 's'} linked to your claude.ai account. They have no local config file and are fetched at session start.`,
      data: { count: connectors.length, source: node.id },
    })
    for (const displayName of connectors) {
      const toolPrefix = connectorToolPrefix(displayName)
      const frag = toolPrefix.slice('mcp__claude_ai_'.length, -2)
      const c = ctx.b.node({
        id: cloudId('connector', frag),
        kind: 'connector',
        label: displayName.replace(/^claude\.ai\s+/i, ''),
        scope: 'cloud',
        layer: 'config',
        parentId: ctx.ids.cloudConnectors,
        summary: `Remote MCP connector from your claude.ai account; its tools appear as ${toolPrefix}*.`,
        data: { displayName, toolPrefix },
      })
      const tool = ensureMcpToolPrefix(ctx, toolPrefix, displayName)
      ctx.b.edge({ kind: 'surfacesAs', source: c.id, target: tool.id, label: toolPrefix })
    }
  }

  return { exists: true, entries, connectors, pluginUsage: usageMap(v.pluginUsage), skillUsage: usageMap(v.skillUsage), githubRepoPaths }
}

/** pluginUsage / skillUsage counters -> stats and recordsUsage edges from the .claude.json node. */
export function linkUsage(ctx: ScanContext, result: ClaudeJsonResult): void {
  const source = ctx.b.byKind('claudeJson')[0]
  if (!source) return
  for (const plugin of ctx.b.byKind('plugin')) {
    const u = result.pluginUsage[plugin.data.id]
    if (!u) continue
    plugin.stats = { ...plugin.stats, usageCount: u.usageCount, lastUsedAt: u.lastUsedAt }
    ctx.b.edge({ kind: 'recordsUsage', source: source.id, target: plugin.id, data: { usageCount: u.usageCount, lastUsedAt: u.lastUsedAt } })
  }
  for (const skill of ctx.b.byKind('skill')) {
    const u = result.skillUsage[skill.data.name]
    if (!u) continue
    skill.stats = { ...skill.stats, usageCount: u.usageCount, lastUsedAt: u.lastUsedAt }
    ctx.b.edge({ kind: 'recordsUsage', source: source.id, target: skill.id, data: { usageCount: u.usageCount, lastUsedAt: u.lastUsedAt } })
  }
}
