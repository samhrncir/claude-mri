// Scan orchestrator: discover everything, link it, and finalize a deterministic snapshot.
import { randomUUID } from 'node:crypto'
import type { Meta, Node, Snapshot } from '../../shared/snapshot.js'
import { mergeEnrichment, startEnrichment, type EnrichmentHandle } from '../enrich/claudeCli.js'
import { linkUsage, scanClaudeJson } from './claudeJson.js'
import { createContext, type ProgressFn, type ScanOptions } from './context.js'
import { scanDesktop } from './desktop.js'
import type { ScanEnv } from './env.js'
import { linkHookMatches } from './hooks.js'
import { scanManaged } from './managed.js'
import { scanMemory } from './memory.js'
import { linkPermissions } from './permissions.js'
import { scanPlans } from './plans.js'
import { linkPluginEnablement, scanPlugins } from './plugins.js'
import { linkPrecedence } from './precedence.js'
import { discoverProjects, scanProjects } from './projects.js'
import { scanLiveSessions, scanSessions } from './sessions.js'
import { ensureCoreNodes } from './tools.js'
import { scanUserScope } from './userScope.js'

export interface ScanResult {
  snapshot: Snapshot
  /** Resolves after the optional CLI enrichment has been merged into `snapshot` (same object, mutated). */
  enriched: Promise<Snapshot>
}

export async function scan(env: ScanEnv, opts: ScanOptions, progress?: ProgressFn): Promise<Snapshot> {
  const result = await scanWithEnrichment(env, opts, progress)
  return opts.cli ? result.enriched : result.snapshot
}

/** Scans the file system first, then lets the server publish while the slower CLI enrichment finishes. */
export async function scanWithEnrichment(env: ScanEnv, opts: ScanOptions, progress?: ProgressFn): Promise<ScanResult> {
  const started = Date.now()
  const ctx = createContext(env, opts, progress)
  const steps = ['core', 'user scope', 'state file', 'organization', 'desktop', 'plugins', 'projects', 'memory & sessions', 'linking']
  let done = 0
  const tick = (phase: string) => ctx.progress(phase, (done += 1), steps.length)
  const enrichment: EnrichmentHandle | null = opts.cli ? startEnrichment(env, ctx.paths.configDirOverridden ? ctx.paths.configDir : undefined) : null

  ensureCoreNodes(ctx)
  tick('core')
  await scanUserScope(ctx)
  tick('user scope')
  const registry = await scanClaudeJson(ctx)
  tick('state file')
  const managedProbes = await scanManaged(ctx)
  tick('organization')
  const desktopProbe = await scanDesktop(ctx)
  tick('desktop')
  await scanPlugins(ctx)
  enrichment?.requestDetails(ctx.b.byKind('plugin').filter((p) => !p.data.orphan && p.data.installPathExists).map((p) => p.data.name))
  tick('plugins')
  const history = ctx.b.byKind('logFile').find((n) => n.label === 'history.jsonl') as Node<'logFile'> | undefined
  const discovery = await discoverProjects(ctx, registry, history?.data.byProject ?? {})
  await scanProjects(ctx, discovery)
  tick('projects')
  await scanMemory(ctx, discovery)
  await scanSessions(ctx, discovery)
  await scanLiveSessions(ctx, discovery)
  await scanPlans(ctx)
  tick('memory & sessions')

  linkPluginEnablement(ctx)
  linkPrecedence(ctx)
  linkHookMatches(ctx)
  linkPermissions(ctx)
  linkUsage(ctx, registry)
  tick('linking')

  const meta: Meta = {
    toolVersion: opts.toolVersion,
    snapshotId: randomUUID(),
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    platform: env.platform,
    homeDir: ctx.paths.home,
    configDir: ctx.paths.configDir,
    configDirOverridden: ctx.paths.configDirOverridden,
    claudeJsonPath: ctx.paths.claudeJsonPath,
    cliAvailable: false,
    roots: env.roots,
    mode: 'local',
    redaction: 'local',
    probes: { managedSettings: managedProbes.managedSettings, claudeDesktop: desktopProbe, registryPolicy: managedProbes.registryPolicy },
    counts: { nodesByKind: {}, edgesByKind: {}, filesInlined: 0 },
    layersPresent: [],
  }
  const snapshot = ctx.b.finalize(meta)

  const enriched = (async () => {
    if (!enrichment) return snapshot
    const e = await enrichment.result()
    snapshot.meta.cliAvailable = e.available
    if (e.version) snapshot.meta.claudeVersion = e.version
    if (e.available) {
      mergeEnrichment(ctx, e)
      // Re-finalize so new nodes, flags and warnings from the CLI land in the same snapshot object.
      const refreshed = ctx.b.finalize({ ...snapshot.meta, durationMs: Date.now() - started })
      snapshot.nodes = refreshed.nodes
      snapshot.edges = refreshed.edges
      snapshot.warnings = refreshed.warnings
      snapshot.meta = refreshed.meta
    }
    return snapshot
  })()
  return { snapshot, enriched }
}
