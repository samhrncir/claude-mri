// Claude Desktop's claude_desktop_config.json: MCP servers Claude Code does NOT read (shown as a separate scope).
import { idOf } from '../../shared/ids.js'
import type { Probe } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { readJsonConfig } from './files.js'
import { statSafe } from './fsx.js'
import { emitMcpServer } from './mcp.js'
import { dirnameOf } from './paths.js'

export async function scanDesktop(ctx: ScanContext): Promise<Probe> {
  const abs = ctx.paths.desktopConfigPath
  const st = await statSafe(abs)
  if (!st) return { path: abs, exists: false }
  const container = ctx.b.node({
    id: idOf('claudeDesktop', ctx.idPath(dirnameOf(abs))),
    kind: 'claudeDesktop',
    label: 'Claude Desktop',
    scope: 'desktop',
    layer: 'config',
    parentId: ctx.ids.machine,
    path: dirnameOf(abs),
    summary: 'The Claude Desktop app keeps its own MCP configuration. Claude Code does not read it, but `claude mcp add-from-claude-desktop` can import these servers.',
    data: {},
  })
  const cfg = await readJsonConfig(ctx, abs, { intendedKind: 'Claude Desktop config', scope: 'desktop', parentId: container.id })
  if (!cfg) return { path: abs, exists: true, error: 'unreadable or invalid JSON' }
  const servers = cfg.value.mcpServers && typeof cfg.value.mcpServers === 'object' && !Array.isArray(cfg.value.mcpServers) ? (cfg.value.mcpServers as Record<string, unknown>) : {}
  const count = Object.keys(servers).length
  const node = ctx.b.node({
    id: idOf('desktopConfig', ctx.idPath(abs)),
    kind: 'desktopConfig',
    label: 'claude_desktop_config.json',
    scope: 'desktop',
    layer: 'config',
    parentId: container.id,
    path: abs,
    fileId: cfg.entry.id,
    summary: `${count} MCP server${count === 1 ? '' : 's'} configured for the Desktop app; not loaded by Claude Code.`,
    data: { level: 'user', keys: Object.keys(cfg.value), unknownKeys: [], hookGroups: 0 },
    stats: { sizeBytes: cfg.entry.size },
    loadTiming: 'never',
  })
  for (const [name, raw] of Object.entries(servers)) {
    emitMcpServer(ctx, { name, raw, scopeKind: 'desktop', parentId: node.id, fileIdPath: ctx.idPath(abs), path: abs, scope: 'desktop' })
  }
  return { path: abs, exists: true }
}
