import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Node, Snapshot } from '../../src/shared/snapshot.js'
import { scan } from '../../src/server/scan/index.js'
import { projectsTree } from '../fixtures/trees/projects.js'
import { byKind, edgesOfKind, makeFixture, TEST_SCAN_OPTIONS, type Fixture } from '../helpers/fixture.js'

let snap: Snapshot
let fixture: Fixture

const kind = <K extends Node['kind']>(k: K) => byKind(snap, k) as unknown as Node<K>[]
const project = (name: string) => kind('project').find((p) => p.label === name)

beforeAll(async () => {
  fixture = await makeFixture('win32', projectsTree)
  fixture.env.roots = [`${fixture.dir}/root/scanned`]
  snap = await scan(fixture.env, TEST_SCAN_OPTIONS)
})

afterAll(async () => {
  await fixture.cleanup()
})

describe('project discovery', () => {
  it('finds projects from the registry, history, transcripts and roots, folding worktrees and marking ghosts', () => {
    const labels = kind('project').map((p) => p.label).sort()
    expect(labels).toEqual(['app', 'gone', 'orphan', 'other', 'proj1', '~ (home folder)'])
    expect(project('gone')?.flags).toContain('ghost')
    expect(project('~ (home folder)')?.data.isHome).toBe(true)
    expect(project('orphan')?.data.sources).toEqual(['transcripts'])
    expect(project('other')?.data.sources).toEqual(['history'])
    expect(project('proj1')?.data.sources).toEqual(['rootScan'])
    expect(kind('worktree')).toHaveLength(1)
    const app = project('app')
    expect(app?.data.registryKeys[0]).toContain('\\')
    expect(app?.data.encodedDirName).toBeDefined()
    expect(app?.data.gitRemote).toBe('https://github.com/sam/app.git')
    expect(app?.data.worktreeCount).toBe(1)
    expect(edgesOfKind(snap, 'sameProjectAs')).toHaveLength(2) // worktree + differently spelled registry key
  })

  it('does not draw nesting edges to the home folder project', () => {
    const nested = edgesOfKind(snap, 'nestedIn')
    const home = project('~ (home folder)')
    expect(nested.filter((e) => e.target === home?.id)).toHaveLength(0)
    expect(nested.some((e) => e.source === project('proj1')?.id)).toBe(false)
  })
})

describe('project configuration', () => {
  it('scans the CLAUDE.md hierarchy with imports, cycles, missing targets, parents and nested files', () => {
    const app = project('app')
    const mds = kind('claudeMd').filter((m) => m.parentId === app?.id)
    expect(mds.map((m) => m.data.role).sort()).toEqual(['local', 'nested', 'project'])
    const main = mds.find((m) => m.data.role === 'project')
    expect(main?.data.isImportOnly).toBe(true)
    const imports = edgesOfKind(snap, 'imports')
    expect(imports.some((e) => e.source === main?.id && e.label === '@AGENTS.md')).toBe(true)
    expect(imports.some((e) => e.data?.missing && e.label === '@docs/missing.md')).toBe(true)
    expect(imports.some((e) => e.data?.cycle)).toBe(true)
    expect(imports.some((e) => e.label === '@types/node')).toBe(false)
    expect(kind('importedDoc').map((d) => d.label).sort()).toEqual(['AGENTS.md', 'loop-a.md', 'loop-b.md', 'missing.md'])
    // The fixture home's CLAUDE.md is a parent of app; it belongs to the home project because that folder is a project too.
    const parent = kind('claudeMd').find((m) => m.data.role === 'parent' && m.path === `${fixture.home}/CLAUDE.md`)
    expect(parent?.parentId).toBe(project('~ (home folder)')?.id)
    expect(edgesOfKind(snap, 'loadsAtStartup').some((e) => e.source === app?.id && e.target === parent?.id)).toBe(true)
    expect(edgesOfKind(snap, 'loadsLazily')).toHaveLength(1)
    expect(kind('claudeMd').some((m) => m.path?.includes('node_modules'))).toBe(false)
    expect(snap.warnings.some((w) => w.code === 'import.cycle')).toBe(true)
    expect(snap.warnings.some((w) => w.code === 'import.missing')).toBe(true)
  })

  it('scans settings, rules, components, MCP approvals, launch config and the worktree', () => {
    const app = project('app')
    const settings = kind('settings').filter((s) => s.parentId === app?.id)
    expect(settings.map((s) => s.data.level).sort()).toEqual(['local', 'project'])
    const rules = kind('rulesFile')
    expect(rules).toHaveLength(2)
    expect(rules.find((r) => r.label === 'api.md')?.data.lazy).toBe(true)
    expect(rules.find((r) => r.label === 'api.md')?.loadTiming).toBe('lazy')
    expect(kind('agent').map((a) => a.data.name)).toEqual(['tester'])
    expect(kind('skill').map((s) => s.data.invocation)).toEqual(['/deploy'])
    expect(kind('command').map((c) => c.data.invocation)).toEqual(['/ops:restart'])
    const servers = kind('mcpServer')
    const byName = Object.fromEntries(servers.map((s) => [s.label, s]))
    expect(byName.shared?.data).toMatchObject({ scopeKind: 'project', approval: 'enabled', transport: 'http' })
    expect(byName.blocked?.data.approval).toBe('disabled')
    expect(byName.pending?.data.approval).toBe('pending')
    expect(byName.localdb?.data).toMatchObject({ scopeKind: 'local', args: ['--password', '«redacted»'] })
    expect(byName.desktopOnly?.data).toMatchObject({ scopeKind: 'desktop' })
    expect(byName.desktopOnly?.data.toolPrefix).toBeUndefined()
    expect(edgesOfKind(snap, 'approves')).toHaveLength(1)
    expect(edgesOfKind(snap, 'rejects')).toHaveLength(1)
    expect(kind('launchConfig')[0]?.data.configurations).toEqual([{ name: 'web', type: 'node', port: 3000, runtimeExecutable: undefined }])
    const wt = kind('worktree')[0]
    expect(wt?.data.gitdir).toContain('.git/worktrees/feature-x')
    expect(kind('claudeMd').some((m) => m.parentId === wt?.id && m.data.role === 'worktree')).toBe(true)
    expect(kind('settings').some((s) => s.parentId === wt?.id)).toBe(true)
    const state = kind('projectState').find((s) => s.parentId === app?.id)
    expect(state?.data.hasTrustDialogAccepted).toBe(true)
    expect(kind('permissionRule').some((r) => r.parentId === state?.id && r.flags?.includes('legacy'))).toBe(true)
  })

  it('computes precedence edges and the effective view', () => {
    const app = project('app')
    const overrides = edgesOfKind(snap, 'overrides')
    const chain = overrides.filter((e) => {
      const src = snap.nodes.find((n) => n.id === e.source) as Node<'settings'> | undefined
      const dst = snap.nodes.find((n) => n.id === e.target) as Node<'settings'> | undefined
      return src && dst && (src.parentId === app?.id || dst.parentId === app?.id || src.data.level === 'managed' || dst.data.level === 'managed')
    })
    expect(chain.length).toBeGreaterThanOrEqual(3)
    const eff = app?.data.effective
    expect(eff?.model).toMatchObject({ value: 'sonnet', level: 'managed' })
    expect(eff?.permissions.allow.map((p) => p.value).sort()).toEqual(['Bash(git *)', 'Bash(npm run *)', 'Read'])
    expect(eff?.permissions.deny.map((p) => p.value).sort()).toEqual(['Read(./.env)', 'WebFetch'])
    expect(eff?.env.FOO).toMatchObject({ value: 'bar', level: 'managed' })
    const other = project('other')
    expect(other?.data.effective.model).toMatchObject({ value: 'sonnet', level: 'managed' })
  })

  it('reports managed and desktop scopes and probes', () => {
    expect(kind('managedScope')).toHaveLength(1)
    expect(kind('settings').filter((s) => s.data.level === 'managed')).toHaveLength(2)
    expect(kind('claudeMd').some((m) => m.data.role === 'managed')).toBe(true)
    expect(kind('claudeDesktop')).toHaveLength(1)
    expect(kind('desktopConfig')).toHaveLength(1)
    expect(snap.meta.probes.managedSettings[0]?.exists).toBe(true)
    expect(snap.meta.probes.claudeDesktop.exists).toBe(true)
    expect(snap.meta.probes.registryPolicy).toBeUndefined()
  })
})
