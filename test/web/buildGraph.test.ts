import { describe, expect, it } from 'vitest'
import type { Edge, Node, Snapshot } from '../../src/shared/snapshot.js'
import { buildGraph, buildIndexes, defaultExpanded } from '../../src/web/graph/buildGraph.js'
import { fallbackLayout, gridPack } from '../../src/web/graph/layout/fallback.js'
import { toElk } from '../../src/web/graph/layout/toElk.js'
import { defaultFilters } from '../../src/web/store/index.js'
import demo from '../../src/web/demo/demo-snapshot.json'

const demoSnapshot = demo as unknown as Snapshot

function node(partial: Partial<Node> & Pick<Node, 'id' | 'kind' | 'label'>): Node {
  return { scope: 'user', layer: 'config', summary: '', data: {}, ...partial } as Node
}

/** A plugin with 100 skills and 20 agents, like a smaller ecc, plus settings rules pointing at tools. */
function bigPluginSnapshot(): Snapshot {
  const nodes: Node[] = [
    node({ id: 'machine:machine', kind: 'machine', label: 'machine', scope: 'machine' }),
    node({ id: 'userScope:~/.claude', kind: 'userScope', label: 'You', parentId: 'machine:machine' }),
    node({ id: 'settings:~/.claude/settings.json', kind: 'settings', label: 'settings.json', parentId: 'userScope:~/.claude', data: { level: 'user', keys: [], unknownKeys: [], hookGroups: 0 } }),
    node({ id: 'pluginRegistry:~/.claude/plugins', kind: 'pluginRegistry', label: 'Plugins', parentId: 'machine:machine' }),
    node({ id: 'plugin:p', kind: 'plugin', label: 'big', parentId: 'pluginRegistry:~/.claude/plugins', scope: 'plugin', data: { id: 'big@m', name: 'big', marketplace: 'm', version: '1', scope: 'user', installPath: '/p', installPathExists: true, counts: { skills: 100, agents: 20, commands: 0, hookGroups: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 }, unloadedDirs: [], userConfigKeys: [], heldByPids: [], orphan: false } }),
    node({ id: 'toolset:machine#tools', kind: 'toolset', label: 'Tools', parentId: 'machine:machine', scope: 'machine' }),
    node({ id: 'tool:builtin#Bash', kind: 'tool', label: 'Bash', parentId: 'toolset:machine#tools', scope: 'machine', data: { builtin: true } }),
  ]
  const edges: Edge[] = []
  for (let i = 0; i < 100; i += 1) nodes.push(node({ id: `skill:p/s${i}`, kind: 'skill', label: `skill-${i}`, parentId: 'plugin:p', scope: 'plugin', data: { name: `skill-${i}`, invocation: `/big:skill-${i}`, origin: 'plugin', frontmatter: {}, hasHooks: false } }))
  for (let i = 0; i < 20; i += 1) nodes.push(node({ id: `agent:p/a${i}`, kind: 'agent', label: `agent-${i}`, parentId: 'plugin:p', scope: 'plugin', data: { name: `agent-${i}`, origin: 'plugin', frontmatter: {}, hasHooks: false } }))
  for (let i = 0; i < 14; i += 1) {
    nodes.push(node({ id: `permissionRule:s#allow/r${i}`, kind: 'permissionRule', label: `Bash(r${i})`, parentId: 'settings:~/.claude/settings.json', data: { list: 'allow', raw: `Bash(r${i})`, tool: 'Bash' } }))
    edges.push({ id: `allows:r${i}`, kind: 'allows', source: `permissionRule:s#allow/r${i}`, target: 'tool:builtin#Bash' })
  }
  edges.push({ id: 'enables:1', kind: 'enables', source: 'settings:~/.claude/settings.json', target: 'plugin:p' })
  for (let i = 0; i < 100; i += 1) edges.push({ id: `provides:${i}`, kind: 'provides', source: 'plugin:p', target: `skill:p/s${i}` })
  return {
    schemaVersion: 1,
    meta: { toolVersion: 't', snapshotId: 's', scannedAt: '', durationMs: 0, platform: 'linux', homeDir: '/home/x', configDir: '/home/x/.claude', configDirOverridden: false, claudeJsonPath: '/home/x/.claude.json', cliAvailable: false, roots: [], mode: 'local', redaction: 'local', probes: { managedSettings: [], claudeDesktop: { path: '', exists: false } }, counts: { nodesByKind: {}, edgesByKind: {}, filesInlined: 0 }, layersPresent: ['config'] },
    nodes,
    edges,
    files: {},
    warnings: [],
  }
}

describe('buildGraph', () => {
  it('renders the demo with parents before children and no implied edges', () => {
    const indexes = buildIndexes(demoSnapshot)
    const g = buildGraph({ snapshot: demoSnapshot, indexes, filters: defaultFilters(), expanded: {}, groupQuery: {} })
    const seen = new Set<string>()
    for (const n of g.nodes) {
      if (n.parentId) expect(seen.has(n.parentId), `${n.id} after parent`).toBe(true)
      seen.add(n.id)
    }
    expect(g.edges.every((e) => e.data?.baseKind !== 'contains' && e.data?.baseKind !== 'provides')).toBe(true)
    expect(g.nodes.some((n) => n.type === 'container')).toBe(true)
    expect(g.nodes.filter((n) => n.data.layer === 'sessions')).toHaveLength(0)
  })

  it('collapses a big plugin, builds sections on expand and aggregates edges', () => {
    const snap = bigPluginSnapshot()
    const indexes = buildIndexes(snap)
    const collapsed = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: {}, groupQuery: {} })
    const plugin = collapsed.nodes.find((n) => n.id === 'plugin:p')
    expect(plugin?.type).toBe('collapsed')
    expect(plugin?.data.counts).toEqual([
      { kind: 'skill', n: 100 },
      { kind: 'agent', n: 20 },
    ])
    expect(collapsed.nodes.some((n) => n.id.startsWith('skill:'))).toBe(false)
    const enables = collapsed.edges.find((e) => e.data?.baseKind === 'enables')
    expect(enables?.target).toBe('plugin:p')
    // A settings file with 14 rules collapses by default (> 12 children), so its 14 allow edges merge into one.
    expect(collapsed.edges.filter((e) => e.data?.baseKind === 'allows')).toHaveLength(1)
    const settingsOpen = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: { 'settings:~/.claude/settings.json': true }, groupQuery: {} })
    expect(settingsOpen.edges.filter((e) => e.data?.baseKind === 'allows')).toHaveLength(14)

    const expanded = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: { 'plugin:p': true, 'ui:section:plugin:p:agent': false }, groupQuery: {} })
    const skillSection = expanded.nodes.find((n) => n.id === 'ui:section:plugin:p:skill')
    const agentSection = expanded.nodes.find((n) => n.id === 'ui:section:plugin:p:agent')
    expect(skillSection?.type).toBe('collapsed')
    expect(agentSection?.type).toBe('collapsed')
    const open = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: { 'plugin:p': true, 'ui:section:plugin:p:skill': true }, groupQuery: {} })
    expect(open.nodes.filter((n) => n.parentId === 'ui:section:plugin:p:skill')).toHaveLength(100)
    const filtered = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: { 'plugin:p': true, 'ui:section:plugin:p:skill': true }, groupQuery: { 'plugin:p': 'skill-1' } })
    expect(filtered.nodes.filter((n) => n.id.startsWith('skill:')).length).toBe(11)

    const settingsCollapsed = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: { 'settings:~/.claude/settings.json': false }, groupQuery: {} })
    const agg = settingsCollapsed.edges.find((e) => e.data?.baseKind === 'allows')
    expect(agg?.data?.kind).toBe('aggregated')
    expect(agg?.data?.count).toBe(14)
    expect(agg?.data?.label).toBe('allows ×14')
  })

  it('applies default expansion rules', () => {
    const ctx = { projectCount: 10, mostRecentProject: 'project:a', huge: false }
    expect(defaultExpanded(node({ id: 'userScope:x', kind: 'userScope', label: 'u' }), 30, ctx)).toBe(true)
    expect(defaultExpanded(node({ id: 'project:a', kind: 'project', label: 'a' }), 5, ctx)).toBe(true)
    expect(defaultExpanded(node({ id: 'project:b', kind: 'project', label: 'b' }), 5, ctx)).toBe(false)
    expect(defaultExpanded(node({ id: 'plugin:p', kind: 'plugin', label: 'p' }), 21, ctx)).toBe(false)
    expect(defaultExpanded(node({ id: 'plugin:q', kind: 'plugin', label: 'q' }), 5, ctx)).toBe(true)
    expect(defaultExpanded(node({ id: 'userScope:x', kind: 'userScope', label: 'u' }), 3, { ...ctx, huge: true })).toBe(false)
  })
})

describe('layout helpers', () => {
  it('grid packs deterministically', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, width: 200, height: 48 }))
    const a = gridPack(items)
    const b = gridPack(items)
    expect(a).toEqual(b)
    expect(a.width).toBeGreaterThan(200)
    expect(a.positions.get('n0')).toEqual({ x: 16, y: 56 })
  })

  it('produces an ELK graph with lane partitions and only lifted root edges', () => {
    const snap = bigPluginSnapshot()
    const indexes = buildIndexes(snap)
    const g = buildGraph({ snapshot: snap, indexes, filters: defaultFilters(), expanded: {}, groupQuery: {} })
    const elk = toElk(g.nodes, g.edges)
    expect(elk.children?.map((c) => c.layoutOptions?.['elk.partitioning.partition'])).toEqual(['1', '3', '4'])
    for (const e of elk.edges ?? []) expect(e.id.startsWith('lift:')).toBe(true)
    const placed = fallbackLayout(g.nodes, g.edges)
    expect(placed.size).toBe(g.nodes.length)
  })
})
