// Shared state for one scan: environment, resolved paths, the graph builder, and id helpers.
import { cloudId, idOf, machineId } from '../../shared/ids.js'
import { GraphBuilder } from '../graph/builder.js'
import { resolvePaths, type ResolvedPaths, type ScanEnv } from './env.js'
import { pLimit } from './fsx.js'
import { idPathOf, joinPath, scopePath, type ScopeCtx } from './paths.js'

export interface ScanOptions {
  depth: number
  deepSessions: boolean
  cli: boolean
  probeMcp: boolean
  toolVersion: string
}

export type ProgressFn = (phase: string, done: number, total: number) => void

export interface CoreIds {
  machine: string
  userScope: string
  pluginRegistry: string
  toolset: string
  cloudConnectors: string
}

export interface ScanContext {
  env: ScanEnv
  paths: ResolvedPaths
  scope: ScopeCtx
  b: GraphBuilder
  opts: ScanOptions
  limit: <T>(fn: () => Promise<T>) => Promise<T>
  progress: ProgressFn
  ids: CoreIds
  /** Path portion for node ids: scoped (~/, $cfg/) and case-folded on win32. */
  idPath(abs: string): string
  /** Display form: scoped but case-preserving. */
  scoped(abs: string): string
}

export function createContext(env: ScanEnv, opts: ScanOptions, progress: ProgressFn = () => undefined): ScanContext {
  const paths = resolvePaths(env)
  const scope: ScopeCtx = { home: paths.home, configDir: paths.configDir, platform: env.platform }
  const idPath = (abs: string) => idPathOf(abs, scope)
  const ids: CoreIds = {
    machine: idOf('machine', 'machine'),
    userScope: idOf('userScope', idPath(paths.configDir)),
    pluginRegistry: idOf('pluginRegistry', idPath(joinPath(paths.configDir, 'plugins'))),
    toolset: machineId('toolset', 'tools'),
    cloudConnectors: cloudId('cloudConnectors', 'connectors'),
  }
  return {
    env,
    paths,
    scope,
    b: new GraphBuilder(),
    opts,
    limit: pLimit(16),
    progress,
    ids,
    idPath,
    scoped: (abs) => scopePath(abs, scope),
  }
}
