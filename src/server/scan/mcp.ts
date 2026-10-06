// MCP server normalization: transport, redaction, and the tool-name prefix Claude exposes.
import { idOf } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { McpNameKind, McpScopeKind, McpServerData, McpTransport } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import { placeholdersIn, redactArgs, redactMap, redactUrl } from '../redact.js'
import type { ScanContext } from './context.js'
import { ensureMcpToolPrefix } from './tools.js'

export interface ParsedMcpName {
  server: string
  tool?: string
  kind: McpNameKind
  pluginName?: string
  displayName?: string
}

/** Splits `mcp__<server>__<tool>` names used in permission rules and hook matchers. */
export function parseMcpRuleName(name: string): ParsedMcpName | null {
  if (!name.startsWith('mcp__')) return null
  const parts = name.split('__')
  const server = parts[1]
  if (!server) return null
  const toolRaw = parts.slice(2).join('__')
  const tool = toolRaw === '' || toolRaw === '*' ? undefined : toolRaw
  if (server.startsWith('plugin_')) {
    const rest = server.slice('plugin_'.length)
    const i = rest.indexOf('_')
    if (i > 0) return { server: rest.slice(i + 1), tool, kind: 'plugin', pluginName: rest.slice(0, i) }
    return { server: rest, tool, kind: 'plugin' }
  }
  if (server.startsWith('claude_ai_')) {
    const rest = server.slice('claude_ai_'.length)
    return { server: rest, tool, kind: 'connector', displayName: rest.replaceAll('_', ' ') }
  }
  if (/^mcpsrv_/.test(server) || /^[0-9a-f]{32,}$/i.test(server.replaceAll('-', ''))) return { server, tool, kind: 'opaque' }
  return { server, tool, kind: 'plain' }
}

export function mcpToolPrefix(scopeKind: McpScopeKind, name: string, pluginName?: string): string {
  return scopeKind === 'plugin' && pluginName ? `mcp__plugin_${pluginName}_${name}__` : `mcp__${name}__`
}

/** "claude.ai Google Calendar" -> "mcp__claude_ai_Google_Calendar__". */
export function connectorToolPrefix(displayName: string): string {
  const stripped = displayName
    .replace(/^claude\.ai\s+/i, '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
  return `mcp__claude_ai_${stripped}__`
}

export function normalizeMcpServer(name: string, raw: unknown, scopeKind: McpScopeKind, pluginName?: string): McpServerData {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const url = typeof obj.url === 'string' ? obj.url : undefined
  const command = typeof obj.command === 'string' ? obj.command : undefined
  const typeRaw = typeof obj.type === 'string' ? obj.type.toLowerCase() : undefined
  let transport: McpTransport = 'unknown'
  if (typeRaw === 'stdio' || typeRaw === 'http' || typeRaw === 'sse' || typeRaw === 'ws') transport = typeRaw
  else if (command) transport = 'stdio'
  else if (url) transport = /\/sse\b/.test(url) ? 'sse' : 'http'
  const args = Array.isArray(obj.args) ? redactArgs(obj.args) : { args: [], redactedKeys: [] }
  const env = redactMap(obj.env)
  const headers = redactMap(obj.headers)
  const placeholders = new Set<string>([
    ...env.placeholders,
    ...headers.placeholders,
    ...(command ? placeholdersIn(command) : []),
    ...(url ? placeholdersIn(url) : []),
    ...args.args.flatMap((a) => placeholdersIn(a)),
  ])
  return {
    scopeKind,
    name,
    transport,
    command,
    args: args.args.length > 0 ? args.args : undefined,
    url: url ? redactUrl(url) : undefined,
    envKeys: Object.keys(env.values),
    headerKeys: Object.keys(headers.values),
    redactedKeys: [...env.redactedKeys, ...headers.redactedKeys, ...args.redactedKeys],
    placeholders: Array.from(placeholders),
    toolPrefix: scopeKind === 'desktop' ? undefined : mcpToolPrefix(scopeKind, name, pluginName),
  }
}

const SCOPE_TEXT: Record<McpScopeKind, string> = {
  user: 'available in every project (user scope)',
  project: 'shared with the team through .mcp.json',
  local: 'private to you in this project (local scope)',
  plugin: 'bundled with a plugin',
  desktop: 'configured in the Claude Desktop app, which Claude Code does not read',
  managed: 'deployed by your organization',
}

export function summarizeMcp(d: McpServerData): string {
  const how = d.transport === 'stdio' ? `runs \`${d.command ?? '?'}\` locally` : d.url ? `connects to ${d.url}` : 'has an unknown transport'
  return `MCP server that ${how}; ${SCOPE_TEXT[d.scopeKind]}.`
}

export interface McpEmit {
  name: string
  raw: unknown
  scopeKind: McpScopeKind
  parentId: string
  fileIdPath: string
  path: string
  scope: Scope
  pluginName?: string
  pluginId?: string
  /** Overrides the id fragment (default: the server name) when one file defines servers for several owners. */
  idFragment?: string
}

export function emitMcpServer(ctx: ScanContext, o: McpEmit): Node<'mcpServer'> {
  const data = normalizeMcpServer(o.name, o.raw, o.scopeKind, o.pluginName)
  if (o.pluginId) data.pluginId = o.pluginId
  const node = ctx.b.node({
    id: idOf('mcpServer', o.fileIdPath, o.idFragment ?? o.name),
    kind: 'mcpServer',
    label: o.name,
    scope: o.scope,
    layer: 'config',
    parentId: o.parentId,
    path: o.path,
    fileId: o.fileIdPath,
    summary: summarizeMcp(data),
    data,
  })
  if (data.toolPrefix) {
    const tool = ensureMcpToolPrefix(ctx, data.toolPrefix, o.name)
    ctx.b.edge({ kind: 'surfacesAs', source: node.id, target: tool.id, label: data.toolPrefix })
  }
  return node
}
