// Builds a synthetic machine (home dir, config dir, managed dirs) in a temp folder and scans it.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Platform } from '../../src/shared/kinds.js'
import type { Snapshot } from '../../src/shared/snapshot.js'
import type { ScanEnv } from '../../src/server/scan/env.js'
import { scan } from '../../src/server/scan/index.js'
import { normalizePath } from '../../src/server/scan/paths.js'

/** Relative path (under the fixture dir) -> text, JSON object (serialized), or null for an empty directory. */
export type FixtureTree = Record<string, string | object | null>

/** Trees may depend on the generated home path (absolute install paths, registry keys). */
export type TreeInput = FixtureTree | ((home: string) => FixtureTree)

export interface Fixture {
  env: ScanEnv
  dir: string
  home: string
  configDir: string
  cleanup(): Promise<void>
}

export interface FixtureOptions {
  configDirOverride?: string
  roots?: string[]
}

/** Home lives at <dir>/home; APPDATA at <dir>/appdata; ProgramFiles at <dir>/pf; absolute system paths re-root under <dir>/sys. */
export async function makeFixture(platform: Platform, treeInput: TreeInput, opts: FixtureOptions = {}): Promise<Fixture> {
  const dir = normalizePath(await mkdtemp(join(tmpdir(), 'claude-mri-')), platform)
  const home = `${dir}/home`
  const tree = typeof treeInput === 'function' ? treeInput(home) : treeInput
  for (const [rel, value] of Object.entries(tree)) {
    const abs = join(dir, rel)
    if (value === null) {
      await mkdir(abs, { recursive: true })
      continue
    }
    await mkdir(join(abs, '..'), { recursive: true })
    await writeFile(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8')
  }
  const configDir = opts.configDirOverride ?? `${home}/.claude`
  const env: ScanEnv = {
    platform,
    homedir: home,
    env: {
      HOME: home,
      USERPROFILE: home,
      APPDATA: `${dir}/appdata`,
      ProgramFiles: `${dir}/pf`,
      XDG_CONFIG_HOME: `${dir}/xdg`,
    },
    fsRoot: `${dir}/sys`,
    roots: opts.roots ?? [],
    configDirOverride: opts.configDirOverride,
  }
  return { env, dir, home, configDir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

export const TEST_SCAN_OPTIONS = { depth: 3, deepSessions: false, cli: false, probeMcp: false, toolVersion: '0.0.0-test' }

export async function scanFixture(platform: Platform, tree: TreeInput, opts: FixtureOptions = {}): Promise<{ snapshot: Snapshot; fixture: Fixture }> {
  const fixture = await makeFixture(platform, tree, opts)
  try {
    const snapshot = await scan(fixture.env, TEST_SCAN_OPTIONS)
    return { snapshot, fixture }
  } catch (err) {
    await fixture.cleanup()
    throw err
  }
}

export function byKind<K extends Snapshot['nodes'][number]['kind']>(snapshot: Snapshot, kind: K) {
  return snapshot.nodes.filter((n): n is Extract<Snapshot['nodes'][number], { kind: K }> => n.kind === kind)
}

export function edgesOfKind(snapshot: Snapshot, kind: string) {
  return snapshot.edges.filter((e) => e.kind === kind)
}
