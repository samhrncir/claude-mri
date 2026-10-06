// Organization-managed settings and instructions (managed-settings.json, managed-settings.d/*.json, CLAUDE.md, registry policy).
import { execFile } from 'node:child_process'
import { idOf } from '../../shared/ids.js'
import type { Probe } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { fileExists, dirExists } from './files.js'
import { readdirSorted, statSafe } from './fsx.js'
import { scanClaudeMd } from './instructions.js'
import { joinPath } from './paths.js'
import { emitSettings, scanSettingsFile } from './settings.js'

export interface ManagedProbes {
  managedSettings: Probe[]
  registryPolicy?: Probe
}

const SUMMARY = 'Settings and instructions deployed by your organization. They take precedence over everything else and cannot be overridden.'

export async function scanManaged(ctx: ScanContext): Promise<ManagedProbes> {
  const probes: ManagedProbes = { managedSettings: [] }
  for (const dir of ctx.paths.managedDirs) {
    const settingsPath = joinPath(dir, 'managed-settings.json')
    const st = await statSafe(settingsPath)
    probes.managedSettings.push({ path: settingsPath, exists: Boolean(st) })
    const dropInDir = joinPath(dir, 'managed-settings.d')
    const dropIns = (await dirExists(dropInDir)) ? (await readdirSorted(dropInDir)).filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json')).map((e) => joinPath(dropInDir, e.name)) : []
    const md = joinPath(dir, 'CLAUDE.md')
    const hasMd = await fileExists(md)
    if (!st && dropIns.length === 0 && !hasMd) continue
    const scopeNode = ctx.b.node({
      id: idOf('managedScope', ctx.idPath(dir)),
      kind: 'managedScope',
      label: 'Organization',
      scope: 'managed',
      layer: 'config',
      parentId: ctx.ids.machine,
      path: dir,
      summary: SUMMARY,
      data: {},
    })
    if (st) await scanSettingsFile(ctx, settingsPath, 'managed', scopeNode.id, 'managed')
    for (const f of dropIns) await scanSettingsFile(ctx, f, 'managed', scopeNode.id, 'managed')
    if (hasMd) await scanClaudeMd(ctx, md, { role: 'managed', parentId: scopeNode.id, scope: 'managed' })
  }
  if (ctx.paths.queryRegistry) probes.registryPolicy = await scanRegistryPolicy(ctx)
  return probes
}

const REG_KEY = 'HKLM\\SOFTWARE\\Policies\\ClaudeCode'

function regQuery(): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile('reg', ['query', REG_KEY, '/v', 'Settings'], { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) resolve({ ok: false, error: err.message })
      else resolve({ ok: true, stdout: String(stdout) })
    })
  })
}

/** Windows only: an organization can deliver settings through the HKLM policy key instead of a file. */
export async function scanRegistryPolicy(ctx: ScanContext): Promise<Probe> {
  const probe: Probe = { path: REG_KEY, exists: false }
  const res = await regQuery()
  if (!res.ok) {
    // "unable to find the specified registry key" is the normal case on an unmanaged machine.
    if (!/unable to find|cannot find|ERROR/i.test(res.error)) probe.error = res.error
    return probe
  }
  const line = res.stdout.split(/\r?\n/).find((l) => /\bSettings\b\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+/.test(l))
  if (!line) return probe
  const json = line.replace(/^.*?REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+/, '').trim()
  probe.exists = true
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (err) {
    probe.error = `policy value is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    ctx.b.warn({ code: 'managed.registryInvalid', severity: 'error', message: probe.error })
    return probe
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return probe
  const scopeNode = ctx.b.node({
    id: idOf('managedScope', 'registry'),
    kind: 'managedScope',
    label: 'Organization (registry policy)',
    scope: 'managed',
    layer: 'config',
    parentId: ctx.ids.machine,
    summary: SUMMARY,
    data: { source: 'registry', key: REG_KEY },
  })
  emitSettings(ctx, value as Record<string, unknown>, {
    id: idOf('settings', 'registry/hklm/software/policies/claudecode'),
    idPath: 'registry/hklm/software/policies/claudecode',
    label: 'Registry policy (managed)',
    level: 'managed',
    parentId: scopeNode.id,
    scope: 'managed',
  })
  return probe
}
