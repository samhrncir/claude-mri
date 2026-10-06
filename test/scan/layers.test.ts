import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Node, Snapshot } from '../../src/shared/snapshot.js'
import { encodeProjectDir } from '../../src/server/scan/paths.js'
import { scan } from '../../src/server/scan/index.js'
import { projectsTree } from '../fixtures/trees/projects.js'
import { byKind, edgesOfKind, makeFixture, TEST_SCAN_OPTIONS, type Fixture, type FixtureTree } from '../helpers/fixture.js'

let snap: Snapshot
let fixture: Fixture

const kind = <K extends Node['kind']>(k: K) => byKind(snap, k) as unknown as Node<K>[]

function layersTree(home: string): FixtureTree {
  const app = `${home}/dev/app`
  const enc = encodeProjectDir(app)
  const rec = (extra: Record<string, unknown>) => JSON.stringify({ type: 'system', cwd: app, gitBranch: 'main', version: '2.1.290', timestamp: '2026-10-03T10:00:00.000Z', ...extra })
  return {
    ...projectsTree(home),
    [`home/.claude/projects/${enc}/memory/MEMORY.md`]: '# Memory Index\n\n- [Etsy](etsy.md) — shop\n- [Git identity](git.md) — email\n',
    [`home/.claude/projects/${enc}/memory/etsy.md`]: '---\nname: etsy\ndescription: Etsy project facts\nmetadata:\n  type: project\n---\nBody\n',
    [`home/.claude/projects/${enc}/memory/git.md`]: '---\nname: git\ndescription: Git identity\nmetadata:\n  type: user\n---\nBody\n',
    [`home/.claude/projects/${enc}/aaaa1111-0000-0000-0000-000000000001.jsonl`]: `${rec({ sessionId: 'aaaa1111-0000-0000-0000-000000000001' })}\n{"type":"user","message":"hello secret prompt"}\n`,
    [`home/.claude/projects/${enc}/bbbb2222-0000-0000-0000-000000000002.jsonl`]: `${rec({ sessionId: 'bbbb2222-0000-0000-0000-000000000002' })}\n`,
    [`home/.claude/projects/${enc}/bbbb2222-0000-0000-0000-000000000002/subagents/agent-1.jsonl`]: '{}\n',
    [`home/.claude/projects/${enc}/bbbb2222-0000-0000-0000-000000000002/subagents/agent-2.jsonl`]: '{}\n',
    [`home/.claude/projects/${enc}/bbbb2222-0000-0000-0000-000000000002/tool-results/x.txt`]: 'x',
    'home/.claude/projects/C--nowhere-unknown/zzzz.jsonl': '{"type":"mode"}\n',
    [`home/.claude/sessions/${process.pid}.json`]: { pid: process.pid, sessionId: 'bbbb2222-0000-0000-0000-000000000002', cwd: app, startedAt: 1759500000000, version: '2.1.290', name: 'alive-one', status: 'running', pidDomain: 'win32:SECRET-HOST', messagingSocketPath: 'secret-socket' },
    'home/.claude/sessions/999999.json': { pid: 999999, sessionId: 'gone', cwd: `${home}/dev/other`, startedAt: 1759400000000 },
    [`home/.claude/sessions/${process.pid}.deadbeef.key`]: 'never read me',
    'home/.claude/plans/make-a-thing.md': '# Build the thing\n\nSteps...\n',
    'home/.claude/plans/untitled-plan.md': 'no heading here\n',
  }
}

beforeAll(async () => {
  fixture = await makeFixture('win32', layersTree)
  snap = await scan(fixture.env, TEST_SCAN_OPTIONS)
})

afterAll(async () => {
  await fixture.cleanup()
})

describe('memory, sessions and plans layers', () => {
  it('attaches auto-memory to its project', () => {
    const index = kind('memoryIndex')
    expect(index).toHaveLength(1)
    expect(index[0]?.data.entries).toBe(2)
    const app = kind('project').find((p) => p.label === 'app')
    expect(index[0]?.parentId).toBe(app?.id)
    const files = kind('memoryFile')
    expect(files.map((f) => f.data.type).sort()).toEqual(['project', 'user'])
    expect(files.every((f) => f.parentId === index[0]?.id)).toBe(true)
    expect(app?.data.memoryFileCount).toBe(3)
    expect(edgesOfKind(snap, 'remembers')).toHaveLength(1)
  })

  it('records transcripts without reading their bodies', () => {
    const app = kind('project').find((p) => p.label === 'app')
    const sessions = kind('session').filter((s) => s.parentId === app?.id)
    expect(sessions).toHaveLength(2)
    expect(app?.data.sessionCount).toBe(2)
    expect(app?.stats?.sessionCount).toBe(2)
    const withAgents = sessions.find((s) => s.data.sessionId.startsWith('bbbb'))
    expect(withAgents?.data).toMatchObject({ gitBranch: 'main', version: '2.1.290', subagentCount: 2, hasToolResults: true })
    expect(JSON.stringify(snap)).not.toContain('secret prompt')
    const orphanSession = kind('session').find((s) => s.data.sessionId === 'sess-orphan')
    expect(orphanSession).toBeDefined()
    expect(kind('stateDir').find((n) => n.label === 'projects/C--nowhere-unknown/')?.flags).toContain('ghost')
    expect(snap.warnings.some((w) => w.code === 'transcript.noCwd')).toBe(true)
  })

  it('maps live sessions to projects and transcripts, ignoring key files and host details', () => {
    const live = kind('liveSession')
    expect(live).toHaveLength(2)
    const alive = live.find((l) => l.data.pid === process.pid)
    const dead = live.find((l) => l.data.pid === 999999)
    expect(alive?.data.alive).toBe(true)
    expect(dead?.data.alive).toBe(false)
    expect(dead?.flags).toContain('ghost')
    const app = kind('project').find((p) => p.label === 'app')
    expect(alive?.parentId).toBe(app?.id)
    expect(edgesOfKind(snap, 'runsIn')).toHaveLength(2)
    expect(edgesOfKind(snap, 'writes').some((e) => e.source === alive?.id)).toBe(true)
    const text = JSON.stringify(snap)
    expect(text).not.toContain('SECRET-HOST')
    expect(text).not.toContain('secret-socket')
    expect(text).not.toContain('never read me')
  })

  it('lists plans with titles and reports the layers present', () => {
    const plans = kind('plan')
    expect(plans.map((p) => p.data.title).sort()).toEqual(['Build the thing', 'untitled-plan'])
    expect(plans.every((p) => p.layer === 'plans' && p.loadTiming === 'never')).toBe(true)
    expect(snap.meta.layersPresent.sort()).toEqual(['config', 'memory', 'plans', 'sessions', 'state'])
  })
})
