// Permission rules (`Tool(specifier)`) -> permissionRule nodes, resolved to tools, servers and skills.
import { idOf, machineId } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { McpScopeKind, PermissionRuleData } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { parseMcpRuleName } from './mcp.js'
import { ensureBuiltinTool } from './tools.js'

export interface ParsedRule {
  tool: string
  pattern?: string
  mcp?: PermissionRuleData['mcp']
}

export function parsePermissionRule(raw: string): ParsedRule | null {
  // Tool names may end in a wildcard for MCP rules: mcp__server__* or mcp__server__list_*.
  const m = raw.trim().match(/^([A-Za-z_][\w*-]*)(?:\((.*)\))?$/s)
  if (!m) return null
  const tool = m[1] ?? ''
  const pattern = m[2]
  const parsed: ParsedRule = { tool, pattern }
  if (tool.startsWith('mcp__')) {
    const mcp = parseMcpRuleName(tool)
    if (mcp) parsed.mcp = { server: mcp.server, tool: mcp.tool, kind: mcp.kind, pluginName: mcp.pluginName }
  }
  return parsed
}

const LIST_TEXT = { allow: 'Allowed without asking', deny: 'Always blocked', ask: 'Always asks first' } as const

function describeRule(list: PermissionRuleData['list'], p: ParsedRule): string {
  const head = LIST_TEXT[list]
  if (p.mcp) return `${head}: ${p.mcp.tool ? `tool "${p.mcp.tool}"` : 'every tool'} from MCP server "${p.mcp.server}".`
  if (p.pattern === undefined) return `${head}: every use of the ${p.tool} tool.`
  return `${head}: ${p.tool} calls matching \`${p.pattern}\`.`
}

export interface PermissionCounts {
  allow: number
  deny: number
  ask: number
}

/** Emits a permissionRule node per entry of permissions.allow / deny / ask under the given settings node. */
export function buildPermissionNodes(ctx: ScanContext, settings: Node, perms: Record<string, unknown>, scope: Scope, legacy = false): PermissionCounts {
  const counts: PermissionCounts = { allow: 0, deny: 0, ask: 0 }
  const settingsIdPath = ctx.idPath(settings.path ?? settings.id)
  const seen = new Map<string, number>()
  for (const list of ['allow', 'deny', 'ask'] as const) {
    const entries = perms[list]
    if (!Array.isArray(entries)) continue
    for (const raw of entries) {
      if (typeof raw !== 'string') continue
      counts[list] += 1
      const parsed = parsePermissionRule(raw)
      const frag = `${list}/${raw}`
      const n = seen.get(frag) ?? 0
      seen.set(frag, n + 1)
      const id = idOf('permissionRule', settingsIdPath, n === 0 ? frag : `${frag}@${n + 1}`)
      if (!parsed) {
        ctx.b.node({ id, kind: 'permissionRule', label: raw, scope, layer: 'config', parentId: settings.id, path: settings.path, fileId: settings.fileId, summary: `Unparseable permission rule.`, data: { list, raw, tool: raw, legacy }, flags: ['broken'] })
        ctx.b.warn({ code: 'permissions.unparseable', severity: 'warn', message: `${settings.path}: cannot parse rule "${raw}"`, path: settings.path, nodeId: id })
        continue
      }
      const data: PermissionRuleData = { list, raw, tool: parsed.tool, pattern: parsed.pattern, mcp: parsed.mcp }
      if (legacy) data.legacy = true
      ctx.b.node({ id, kind: 'permissionRule', label: raw, scope, layer: 'config', parentId: settings.id, path: settings.path, fileId: settings.fileId, summary: describeRule(list, parsed), data, flags: legacy ? ['legacy'] : undefined })
    }
  }
  return counts
}

const EDGE_FOR_LIST = { allow: 'allows', deny: 'denies', ask: 'asks' } as const
const SCOPE_PRIORITY: Record<McpScopeKind, number> = { local: 0, project: 1, user: 2, plugin: 3, managed: 4, desktop: 9 }

/** Walks parentId up to the nearest project / worktree / scope container. */
export function ownerScopeOf(ctx: ScanContext, nodeId: string): Node | undefined {
  let cur = ctx.b.get(nodeId)
  while (cur) {
    if (cur.kind === 'project' || cur.kind === 'worktree' || cur.kind === 'userScope' || cur.kind === 'managedScope' || cur.kind === 'plugin') return cur
    cur = cur.parentId ? ctx.b.get(cur.parentId) : undefined
  }
  return undefined
}

function resolveMcpTarget(ctx: ScanContext, rule: Node<'permissionRule'>): string | undefined {
  const mcp = rule.data.mcp
  if (!mcp) return undefined
  if (mcp.kind === 'connector') {
    const want = mcp.server.toLowerCase()
    const hit = ctx.b.byKind('connector').find((c) => c.data.toolPrefix.toLowerCase() === `mcp__claude_ai_${want}__`)
    return hit?.id
  }
  const owner = ownerScopeOf(ctx, rule.id)
  const candidates = ctx.b
    .byKind('mcpServer')
    .filter((s) => s.data.name === mcp.server && (mcp.kind !== 'plugin' || !mcp.pluginName || s.data.toolPrefix === `mcp__plugin_${mcp.pluginName}_${mcp.server}__`))
    .sort((a, b) => {
      const sameOwnerA = owner && ownerScopeOf(ctx, a.id)?.id === owner.id ? -1 : 0
      const sameOwnerB = owner && ownerScopeOf(ctx, b.id)?.id === owner.id ? -1 : 0
      return sameOwnerA - sameOwnerB || SCOPE_PRIORITY[a.data.scopeKind] - SCOPE_PRIORITY[b.data.scopeKind]
    })
  return candidates[0]?.id
}

function ensureUnknownServer(ctx: ScanContext, server: string, ruleId: string): Node<'unknownMcpServer'> {
  const id = machineId('unknownMcpServer', server)
  const existing = ctx.b.get(id) as Node<'unknownMcpServer'> | undefined
  if (existing) {
    if (!existing.data.referencedBy.includes(ruleId)) existing.data.referencedBy.push(ruleId)
    return existing
  }
  return ctx.b.node({
    id,
    kind: 'unknownMcpServer',
    label: server.length > 24 ? `${server.slice(0, 21)}…` : server,
    scope: 'machine',
    layer: 'config',
    parentId: ctx.ids.toolset,
    summary: `An MCP server named "${server}" is referenced by a permission rule but is not defined anywhere that was scanned.`,
    data: { server, referencedBy: [ruleId] },
    flags: ['missing'],
  })
}

/** After everything is scanned: permissionRule -> target edges (allows / denies / asks). */
export function linkPermissions(ctx: ScanContext): void {
  const skills = ctx.b.byKind('skill')
  for (const rule of ctx.b.byKind('permissionRule')) {
    if (rule.flags?.includes('broken')) continue
    const kind = EDGE_FOR_LIST[rule.data.list]
    let target: string | undefined
    if (rule.data.mcp) {
      target = resolveMcpTarget(ctx, rule)
      if (!target) {
        const unknown = ensureUnknownServer(ctx, rule.data.mcp.server, rule.id)
        target = unknown.id
        ctx.b.warn({ code: 'mcp.unknownServerInRule', severity: 'info', message: `rule "${rule.data.raw}" references unknown MCP server "${rule.data.mcp.server}"`, path: rule.path, nodeId: rule.id })
      }
    } else if (rule.data.tool === 'Skill' && rule.data.pattern) {
      const want = rule.data.pattern.replace(/^\//, '')
      const hit = skills.find((s) => s.data.invocation.replace(/^\//, '') === want) ?? skills.find((s) => s.data.name === want)
      target = hit?.id ?? ensureBuiltinTool(ctx, 'Skill').id
    } else {
      target = ensureBuiltinTool(ctx, rule.data.tool).id
    }
    rule.data.resolvedTargetId = target
    ctx.b.edge({ kind, source: rule.id, target, label: rule.data.pattern, data: { rule: rule.data.raw, effect: rule.data.list } })
  }
}
