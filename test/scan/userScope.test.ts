import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Node, Snapshot } from '../../src/shared/snapshot.js'
import { scan } from '../../src/server/scan/index.js'
import { GH_TOKEN, baseUser } from '../fixtures/trees/base.js'
import { byKind, edgesOfKind, makeFixture, TEST_SCAN_OPTIONS, type Fixture } from '../helpers/fixture.js'

let snap: Snapshot
let fixture: Fixture

const kind = <K extends Node['kind']>(k: K) => byKind(snap, k) as unknown as Node<K>[]

beforeAll(async () => {
  fixture = await makeFixture('win32', baseUser)
  snap = await scan(fixture.env, TEST_SCAN_OPTIONS)
})

afterAll(async () => {
  await fixture.cleanup()
})

describe('user scope and plugins', () => {
  it('finds settings, instructions and imports', () => {
    const settings = kind('settings')
    expect(settings).toHaveLength(1)
    expect(settings[0]?.data).toMatchObject({ level: 'user', model: 'sonnet', hookGroups: 2 })
    expect(kind('claudeMd')).toHaveLength(1)
    expect(kind('importedDoc').map((n) => n.label)).toEqual(['style.md'])
    expect(edgesOfKind(snap, 'imports')).toHaveLength(1)
  })

  it('emits permission rules linked to tools, servers and skills', () => {
    expect(kind('permissionRule')).toHaveLength(6)
    const allows = edgesOfKind(snap, 'allows')
    const denies = edgesOfKind(snap, 'denies')
    expect(allows).toHaveLength(4)
    expect(denies).toHaveLength(2)
    expect(allows.some((e) => e.target === 'tool:builtin#Bash')).toBe(true)
    expect(allows.some((e) => e.target.startsWith('mcpServer:') && e.target.endsWith('#github'))).toBe(true)
    expect(allows.some((e) => e.target.startsWith('skill:'))).toBe(true)
    expect(kind('unknownMcpServer').map((n) => n.data.server)).toEqual(['nowhere'])
  })

  it('wires hooks to events and tools', () => {
    expect(kind('hookGroup')).toHaveLength(4)
    const matches = edgesOfKind(snap, 'matches')
    const hooks = kind('hook')
    const settingsHook = hooks.find((h) => h.label === 'check.js')
    expect(settingsHook).toBeDefined()
    // Matchers are unanchored regexes, so Bash|Edit also reaches MultiEdit and NotebookEdit.
    const targets = matches.filter((e) => e.source === settingsHook?.id).map((e) => e.target).sort()
    expect(targets).toEqual(['tool:builtin#Bash', 'tool:builtin#Edit', 'tool:builtin#MultiEdit', 'tool:builtin#NotebookEdit'])
    const guard = hooks.find((h) => h.label === 'guard.js')
    const prefixTargets = matches.filter((e) => e.source === guard?.id).map((e) => e.target)
    expect(prefixTargets).toHaveLength(3) // github, devtools, connector prefixes
    expect(prefixTargets.every((t) => t.startsWith('tool:mcp#mcp__'))).toBe(true)
    expect(kind('hookEvent').map((n) => n.label).sort()).toEqual(['PostToolUse', 'PreToolUse', 'Stop'])
  })

  it('describes the plugin, its components and its marketplace', () => {
    const plugins = kind('plugin')
    const demo = plugins.find((p) => p.data.version === '1.0.0')
    const orphan = plugins.find((p) => p.data.version === '0.9.0')
    const ghost = plugins.find((p) => p.data.id === 'ghostly@local')
    expect(demo?.data.counts).toMatchObject({ skills: 2, agents: 1, commands: 1, hookGroups: 2, mcpServers: 1 })
    expect(demo?.data.enabledInSettings).toBe(true)
    expect(demo?.data.unloadedDirs).toEqual(['rules'])
    expect(demo?.data.configuredOptions).toEqual({ verbosity: 'high', api_key: '«redacted»' })
    expect(demo?.stats?.usageCount).toBe(3)
    expect(orphan?.flags).toContain('orphan')
    expect(ghost?.flags).toContain('ghost')
    expect(edgesOfKind(snap, 'installedFrom')).toHaveLength(1)
    const mkt = kind('marketplace')
    expect(mkt).toHaveLength(1)
    expect(mkt[0]?.data.catalog).toEqual([
      { name: 'demo', version: '1.0.0', category: undefined, installed: true },
      { name: 'other', version: '2.0.0', category: undefined, installed: false },
    ])
    expect(kind('skill').map((s) => s.data.invocation).sort()).toEqual(['/anthropic-skills:pdf', '/demo:alpha', '/demo:beta', '/my-skill'])
    expect(kind('syncedBucket')).toHaveLength(1)
    expect(kind('command')[0]?.data.invocation).toBe('/demo:aside')
  })

  it('normalizes and redacts MCP servers and connectors', () => {
    const servers = kind('mcpServer')
    const github = servers.find((s) => s.label === 'github')
    const devtools = servers.find((s) => s.label === 'devtools')
    expect(github?.data).toMatchObject({ scopeKind: 'user', transport: 'http', headerKeys: ['Authorization'], redactedKeys: ['Authorization'] })
    expect(devtools?.data).toMatchObject({ scopeKind: 'plugin', transport: 'stdio', toolPrefix: 'mcp__plugin_demo_devtools__', placeholders: ['${MY_KEY}'] })
    expect(devtools?.data.args).toEqual(['-y', 'devtools-mcp', '--token', '«redacted»'])
    expect(devtools?.data.redactedKeys).toEqual(['token'])
    expect(devtools?.data.envKeys).toEqual(['DEBUG', 'API_KEY'])
    const connectors = kind('connector')
    expect(connectors).toHaveLength(1)
    expect(connectors[0]?.data.toolPrefix).toBe('mcp__claude_ai_Google_Calendar__')
    expect(edgesOfKind(snap, 'surfacesAs')).toHaveLength(3)
  })

  it('never leaks secrets or account details and keeps ids stable', async () => {
    const text = JSON.stringify(snap)
    expect(text).not.toContain(GH_TOKEN)
    expect(text).not.toContain('secret@example.com')
    expect(text).not.toContain('sk-ant-oat01')
    expect(text).not.toContain('u'.repeat(64))
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('shh-secret')
    const stateFile = Object.values(snap.files).find((f) => f.path.endsWith('/.claude.json'))
    expect(stateFile).toBeDefined()
    expect(stateFile?.content).toBeUndefined()
    expect(kind('credentials')).toHaveLength(1)
    const again = await scan(fixture.env, TEST_SCAN_OPTIONS)
    expect(again.nodes.map((n) => n.id)).toEqual(snap.nodes.map((n) => n.id))
    expect(again.edges.map((e) => e.id)).toEqual(snap.edges.map((e) => e.id))
    for (const n of snap.nodes) expect(n.id.toLowerCase().includes(fixture.home.toLowerCase())).toBe(false)
    const ids = new Set(snap.nodes.map((n) => n.id))
    for (const e of snap.edges) {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    }
    for (const n of snap.nodes) if (n.parentId) expect(ids.has(n.parentId)).toBe(true)
  })

  it('classifies state residue and the history log', () => {
    expect(kind('stateDir').map((n) => n.label)).toEqual(['docs/', 'state/'])
    const history = kind('logFile').find((n) => n.label === 'history.jsonl')
    expect(history?.stats?.lines).toBe(1)
    expect(JSON.stringify(history?.data)).not.toContain('hello')
    expect(kind('logFile').some((n) => n.label === 'bash-commands.log')).toBe(true)
  })
})
