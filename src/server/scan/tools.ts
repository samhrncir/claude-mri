// Tool nodes: built-in tools and MCP tool-name prefixes, all parented to the toolset container.
import { idOf } from '../../shared/ids.js'
import type { Node } from '../../shared/snapshot.js'
import { BUILTIN_TOOLS } from '../../shared/vocab.js'
import type { ScanContext } from './context.js'

export function builtinToolId(name: string): string {
  return idOf('tool', 'builtin', name)
}

export function mcpToolId(prefix: string): string {
  return idOf('tool', 'mcp', prefix)
}

export function ensureBuiltinTool(ctx: ScanContext, name: string): Node<'tool'> {
  const id = builtinToolId(name)
  const existing = ctx.b.get(id) as Node<'tool'> | undefined
  if (existing) return existing
  const builtin = (BUILTIN_TOOLS as readonly string[]).includes(name)
  return ctx.b.node({
    id,
    kind: 'tool',
    label: name,
    scope: 'machine',
    layer: 'config',
    parentId: ctx.ids.toolset,
    summary: builtin ? `Built-in ${name} tool.` : `Tool named "${name}" referenced by a rule or hook; not a known built-in.`,
    data: { builtin },
  })
}

export function ensureMcpToolPrefix(ctx: ScanContext, prefix: string, server: string): Node<'tool'> {
  const id = mcpToolId(prefix)
  const existing = ctx.b.get(id) as Node<'tool'> | undefined
  if (existing) return existing
  return ctx.b.node({
    id,
    kind: 'tool',
    label: `${prefix}*`,
    scope: 'machine',
    layer: 'config',
    parentId: ctx.ids.toolset,
    summary: `Tools from MCP server "${server}" appear to Claude under this name prefix.`,
    data: { builtin: false, mcp: { server, prefix } },
  })
}

export function ensureCoreNodes(ctx: ScanContext): void {
  ctx.b.node({
    id: ctx.ids.machine,
    kind: 'machine',
    label: 'This machine',
    scope: 'machine',
    layer: 'config',
    summary: 'Everything Claude Code reads on this computer.',
    data: {},
  })
  ctx.b.node({
    id: ctx.ids.toolset,
    kind: 'toolset',
    label: 'Tools and events',
    scope: 'machine',
    layer: 'config',
    parentId: ctx.ids.machine,
    summary: 'What Claude is allowed to do (tools) and the lifecycle events hooks can attach to.',
    data: {},
  })
  for (const name of BUILTIN_TOOLS) ensureBuiltinTool(ctx, name)
}
