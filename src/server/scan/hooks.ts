// Hook configuration -> hookEvent / hookGroup / hook nodes, plus matcher resolution to tools.
import { idOf, machineId } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { HookData, HookGroupData, HookSourceKind } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import { BUILTIN_TOOLS, isKnownHookEvent, isToolEvent } from '../../shared/vocab.js'
import { redactTokenShapes } from '../redact.js'
import type { ScanContext } from './context.js'
import { basenameOf } from './paths.js'

export interface HookGroupSpec {
  event: string
  matcher?: string
  hooks: HookData[]
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? redactTokenShapes(v) : undefined)

function toHookData(h: unknown): HookData {
  const o = h && typeof h === 'object' ? (h as Record<string, unknown>) : {}
  const t = o.type
  const type: HookData['type'] = t === 'command' || t === 'prompt' || t === 'agent' || t === 'http' || t === 'mcp_tool' ? t : 'unknown'
  return {
    type,
    command: str(o.command),
    prompt: str(o.prompt),
    url: str(o.url),
    server: str(o.server),
    tool: str(o.tool),
    timeout: typeof o.timeout === 'number' ? o.timeout : undefined,
    async: typeof o.async === 'boolean' ? o.async : undefined,
    statusMessage: str(o.statusMessage),
  }
}

export function parseHooksConfig(hooksObj: unknown): { groups: HookGroupSpec[]; errors: string[] } {
  const groups: HookGroupSpec[] = []
  const errors: string[] = []
  if (hooksObj === undefined || hooksObj === null) return { groups, errors }
  if (typeof hooksObj !== 'object' || Array.isArray(hooksObj)) return { groups, errors: ['hooks must be an object keyed by event name'] }
  for (const [event, raw] of Object.entries(hooksObj as Record<string, unknown>)) {
    if (!Array.isArray(raw)) {
      errors.push(`${event}: expected an array of matcher groups`)
      continue
    }
    for (const g of raw) {
      if (!g || typeof g !== 'object') {
        errors.push(`${event}: matcher group is not an object`)
        continue
      }
      const go = g as Record<string, unknown>
      const hooks = Array.isArray(go.hooks) ? go.hooks.map(toHookData) : []
      groups.push({ event, matcher: typeof go.matcher === 'string' ? go.matcher : undefined, hooks })
    }
  }
  return { groups, errors }
}

export interface MatcherResult {
  hits: string[]
  via: 'all' | 'exact' | 'regex'
  valid: boolean
}

/** Empty, "*" and ".*" match everything; otherwise exact name first, then an unanchored regex. */
export function matcherToTools(matcher: string | undefined, toolNames: readonly string[]): MatcherResult {
  if (matcher === undefined || matcher.trim() === '' || matcher === '*' || matcher === '.*') return { hits: [...toolNames], via: 'all', valid: true }
  if (toolNames.includes(matcher)) return { hits: [matcher], via: 'exact', valid: true }
  try {
    const re = new RegExp(matcher)
    return { hits: toolNames.filter((t) => re.test(t)), via: 'regex', valid: true }
  } catch {
    return { hits: [], via: 'regex', valid: false }
  }
}

export function matcherKey(matcher: string | undefined): string {
  return matcher === undefined || matcher === '' ? '_' : matcher.replace(/[^A-Za-z0-9|.*^$_-]/g, '~')
}

const SCRIPT_RE = /[\w./\\-]+\.(?:m?js|cjs|py|sh|ps1|ts)\b/g

export function hookLabel(h: HookData): string {
  if (h.type === 'command' && h.command) {
    const scripts = h.command.match(SCRIPT_RE)
    if (scripts && scripts.length > 0) return basenameOf((scripts[scripts.length - 1] ?? '').replaceAll('\\', '/'))
    return h.command.length > 48 ? `${h.command.slice(0, 45)}…` : h.command
  }
  if (h.type === 'prompt') return `prompt: ${(h.prompt ?? '').slice(0, 40)}`
  if (h.type === 'agent') return `agent: ${(h.prompt ?? '').slice(0, 40)}`
  if (h.type === 'http') return `http: ${h.url ?? ''}`
  if (h.type === 'mcp_tool') return `${h.server ?? '?'}/${h.tool ?? '?'}`
  return 'hook'
}

export interface HookSource {
  nodeId: string
  idPath: string
  sourceKind: HookSourceKind
  scope: Scope
  path?: string
  fileId?: string
}

export interface HookEmitResult {
  groupCount: number
  hookCount: number
  events: string[]
}

export function ensureHookEvent(ctx: ScanContext, event: string): Node<'hookEvent'> {
  const id = machineId('hookEvent', event)
  const existing = ctx.b.get(id) as Node<'hookEvent'> | undefined
  if (existing) return existing
  const known = isKnownHookEvent(event)
  const summary = !known
    ? 'Event name not recognized by Claude Code 2.1; hooks attached here may never run.'
    : isToolEvent(event)
      ? 'Lifecycle event fired around tool calls; hooks attach here with a tool-name matcher.'
      : 'Lifecycle event Claude Code announces; hooks attached here run when it fires.'
  const node = ctx.b.node({
    id,
    kind: 'hookEvent',
    label: event,
    scope: 'machine',
    layer: 'config',
    parentId: ctx.ids.toolset,
    summary,
    data: { event, known, toolEvent: isToolEvent(event), groupCount: 0, sources: [] },
  })
  if (!known) ctx.b.warn({ code: 'hooks.unknownEvent', severity: 'warn', message: `unknown hook event "${event}"`, nodeId: id })
  return node
}

export function emitHooks(ctx: ScanContext, hooksObj: unknown, source: HookSource): HookEmitResult {
  const { groups, errors } = parseHooksConfig(hooksObj)
  for (const e of errors) {
    ctx.b.warn({ code: 'hooks.invalid', severity: 'warn', message: `${source.path ?? source.nodeId}: ${e}`, path: source.path, nodeId: source.nodeId })
  }
  const perKey = new Map<string, number>()
  const events = new Set<string>()
  let hookCount = 0
  for (const g of groups) {
    events.add(g.event)
    const eventNode = ensureHookEvent(ctx, g.event)
    eventNode.data.groupCount += 1
    if (!eventNode.data.sources.includes(source.nodeId)) eventNode.data.sources.push(source.nodeId)
    const key = `${g.event}/${matcherKey(g.matcher)}`
    const idx = perKey.get(key) ?? 0
    perKey.set(key, idx + 1)
    const frag = `${key}/${idx}`
    const toolEvent = isToolEvent(g.event)
    const m = toolEvent ? matcherToTools(g.matcher, BUILTIN_TOOLS) : { hits: [], via: 'all' as const, valid: true }
    const data: HookGroupData = { event: g.event, matcher: g.matcher, matcherValid: m.valid, hookCount: g.hooks.length, sourceKind: source.sourceKind, matchedTools: m.hits }
    const when = !toolEvent ? `on ${g.event}` : m.via === 'all' ? `on ${g.event} for every tool` : `on ${g.event} when the tool name matches ${g.matcher}`
    const plural = g.hooks.length === 1 ? '' : 's'
    const groupNode = ctx.b.node({
      id: idOf('hookGroup', source.idPath, frag),
      kind: 'hookGroup',
      label: g.matcher ? `${g.event} · ${g.matcher}` : `${g.event} · all`,
      scope: source.scope,
      layer: 'config',
      parentId: source.nodeId,
      path: source.path,
      fileId: source.fileId,
      summary: `${g.hooks.length} hook${plural} run ${when}.`,
      data,
    })
    if (!m.valid) {
      ctx.b.warn({ code: 'hooks.badMatcher', severity: 'warn', message: `invalid matcher regex "${g.matcher}" in ${source.path ?? source.nodeId}`, path: source.path, nodeId: groupNode.id })
    }
    ctx.b.edge({ kind: 'triggers', source: eventNode.id, target: groupNode.id, label: g.matcher })
    g.hooks.forEach((h, hi) => {
      hookCount += 1
      const timeout = h.timeout ? ` (timeout ${h.timeout}s)` : ''
      ctx.b.node({
        id: idOf('hook', source.idPath, `${frag}/${hi}`),
        kind: 'hook',
        label: hookLabel(h),
        scope: source.scope,
        layer: 'config',
        parentId: groupNode.id,
        path: source.path,
        fileId: source.fileId,
        summary: h.type === 'command' ? `Runs a ${h.async ? 'background ' : ''}command ${when}${timeout}.` : `${h.type} hook ${when}.`,
        data: h,
      })
    })
  }
  return { groupCount: groups.length, hookCount, events: Array.from(events) }
}

/** After all tools (including MCP prefixes) are known: hook -> tool `matches` edges. */
export function linkHookMatches(ctx: ScanContext): void {
  const tools = ctx.b.byKind('tool')
  const names = tools.map((t) => t.label)
  for (const group of ctx.b.byKind('hookGroup')) {
    if (!group.data.matcherValid || !isToolEvent(group.data.event)) continue
    const m = matcherToTools(group.data.matcher, names)
    group.data.matchedTools = m.hits
    const hooks = ctx.b.childrenOf(group.id)
    for (const h of hooks) {
      if (m.via === 'all') {
        ctx.b.edge({ kind: 'matches', source: h.id, target: ctx.ids.toolset, label: 'all tools', data: { matcher: group.data.matcher, via: 'all' } })
        continue
      }
      for (const hit of m.hits) {
        const target = tools.find((t) => t.label === hit)
        if (target) ctx.b.edge({ kind: 'matches', source: h.id, target: target.id, label: group.data.matcher, data: { matcher: group.data.matcher, via: m.via } })
      }
    }
  }
}
