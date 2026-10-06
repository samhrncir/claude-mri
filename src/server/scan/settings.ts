// settings.json / settings.local.json / managed-settings.json -> settings node + permission rules + hooks.
import { idOf } from '../../shared/ids.js'
import type { Scope, SettingsLevel } from '../../shared/kinds.js'
import type { SettingsData } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import { KNOWN_SETTINGS_KEYS } from '../../shared/vocab.js'
import { redactMap, redactSecretsDeep } from '../redact.js'
import type { ScanContext } from './context.js'
import { readJsonConfig } from './files.js'
import { emitHooks } from './hooks.js'
import { basenameOf } from './paths.js'
import { buildPermissionNodes } from './permissions.js'

const LEVEL_TEXT: Record<SettingsLevel, string> = {
  managed: 'Organization policy settings; cannot be overridden by any other file.',
  user: 'Your personal settings, applied to every project on this machine.',
  project: 'Shared project settings, usually committed to version control for the whole team.',
  local: 'Your private overrides for this project only (git-ignored); "don\'t ask again" writes allow rules here.',
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

export interface SettingsScan {
  node: Node<'settings'>
  value: Record<string, unknown>
}

export interface SettingsSource {
  id: string
  idPath: string
  label: string
  level: SettingsLevel
  parentId: string
  scope: Scope
  path?: string
  fileId?: string
  sizeBytes?: number
}

/** Builds the settings node (and its permission rules and hooks) from an already-parsed settings object. */
export function emitSettings(ctx: ScanContext, v: Record<string, unknown>, src: SettingsSource): SettingsScan {
  const keys = Object.keys(v)
  const unknownKeys = keys.filter((k) => !(KNOWN_SETTINGS_KEYS as readonly string[]).includes(k))
  const perms = v.permissions && typeof v.permissions === 'object' ? (v.permissions as Record<string, unknown>) : undefined
  const env = v.env ? redactMap(v.env).values : undefined
  const enabledPlugins = v.enabledPlugins && typeof v.enabledPlugins === 'object' ? (v.enabledPlugins as Record<string, boolean>) : undefined

  const data: SettingsData = {
    level: src.level,
    keys,
    unknownKeys,
    hookGroups: 0,
    env,
    model: str(v.model),
    effortLevel: str(v.effortLevel),
    enabledPlugins,
    pluginConfigs: v.pluginConfigs && typeof v.pluginConfigs === 'object' ? (redactSecretsDeep(v.pluginConfigs) as Record<string, unknown>) : undefined,
    disableAllHooks: bool(v.disableAllHooks),
    outputStyle: str(v.outputStyle),
    autoMemoryEnabled: bool(v.autoMemoryEnabled),
    hasStatusLine: v.statusLine !== undefined,
  }

  const node = ctx.b.node({
    id: src.id,
    kind: 'settings',
    label: src.label,
    scope: src.scope,
    layer: 'config',
    parentId: src.parentId,
    path: src.path,
    fileId: src.fileId,
    summary: LEVEL_TEXT[src.level],
    data,
    stats: src.sizeBytes !== undefined ? { sizeBytes: src.sizeBytes } : undefined,
  })

  if (perms) {
    const counts = buildPermissionNodes(ctx, node, perms, src.scope)
    data.permissions = {
      ...counts,
      defaultMode: str(perms.defaultMode),
      additionalDirectories: Array.isArray(perms.additionalDirectories) ? perms.additionalDirectories.map(String) : undefined,
    }
  }
  if (v.hooks !== undefined) {
    const res = emitHooks(ctx, v.hooks, { nodeId: node.id, idPath: src.idPath, sourceKind: 'settings', scope: src.scope, path: src.path, fileId: src.fileId })
    data.hookGroups = res.groupCount
    if (data.disableAllHooks) for (const g of ctx.b.childrenOf(node.id)) if (g.kind === 'hookGroup') ctx.b.addFlag(g.id, 'disabled')
  }
  if (unknownKeys.length > 0) {
    ctx.b.warn({ code: 'settings.unknownKeys', severity: 'info', message: `${src.path ?? src.label}: keys not in the documented settings schema: ${unknownKeys.join(', ')}`, path: src.path, nodeId: node.id })
  }

  const parts: string[] = []
  if (data.permissions) parts.push(`${data.permissions.allow + data.permissions.deny + data.permissions.ask} permission rules`)
  if (data.hookGroups > 0) parts.push(`${data.hookGroups} hook groups`)
  if (enabledPlugins) parts.push(`${Object.keys(enabledPlugins).length} plugin toggles`)
  if (data.model) parts.push(`model ${data.model}`)
  if (env) parts.push(`${Object.keys(env).length} env vars`)
  node.summary = parts.length > 0 ? `${LEVEL_TEXT[src.level]} Sets ${parts.join(', ')}.` : `${LEVEL_TEXT[src.level]} Sets ${keys.length === 0 ? 'nothing yet' : keys.join(', ')}.`
  return { node, value: v }
}

/** Scans one settings file if it exists. Parse failures become brokenFile nodes inside readJsonConfig. */
export async function scanSettingsFile(ctx: ScanContext, abs: string, level: SettingsLevel, parentId: string, scope: Scope): Promise<SettingsScan | null> {
  const cfg = await readJsonConfig(ctx, abs, { intendedKind: `${level} settings`, scope, parentId })
  if (!cfg) return null
  const idPath = ctx.idPath(abs)
  return emitSettings(ctx, cfg.value, {
    id: idOf('settings', idPath),
    idPath,
    label: `${basenameOf(abs)} (${level})`,
    level,
    parentId,
    scope,
    path: abs,
    fileId: cfg.entry.id,
    sizeBytes: cfg.entry.size,
  })
}
