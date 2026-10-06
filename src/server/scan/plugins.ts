// Plugins: registry files, marketplaces, cached plugin code and every component a plugin contributes.
import { idOf } from '../../shared/ids.js'
import { SETTINGS_LEVEL_RANK } from '../../shared/kinds.js'
import type { MarketplaceData, MarketplaceSource, PluginCounts, PluginData, PluginManifestSummary } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import { redactSecretsDeep } from '../redact.js'
import { scanAgentFile, scanAgentsDir, scanCommandFile, scanCommandsDir, scanOutputStylesDir, scanSkillFile, scanSkillsDir, type ComponentOwner } from './components.js'
import type { ScanContext } from './context.js'
import { dirExists, fileExists, readJsonConfig } from './files.js'
import { dirSummary, readdirSorted, statSafe } from './fsx.js'
import { emitHooks } from './hooks.js'
import { emitMcpServer } from './mcp.js'
import { basenameOf, joinPath, normalizePath, pathKey } from './paths.js'

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/** Dirs that look like Claude components but are not loaded by Claude Code (documentation for the user). */
const UNLOADED_LOOKALIKES = ['rules', 'contexts', 'mcp-configs', '.claude', 'templates', 'prompts']

interface InstalledEntry {
  id: string
  name: string
  marketplace: string
  scope: PluginData['scope']
  installPath: string
  version: string
  installedAt?: string
  lastUpdated?: string
  gitCommitSha?: string
}

function readInstalled(value: Record<string, unknown>): InstalledEntry[] {
  const out: InstalledEntry[] = []
  const plugins = isObj(value.plugins) ? value.plugins : {}
  for (const [id, raw] of Object.entries(plugins)) {
    const list = Array.isArray(raw) ? raw : [raw]
    const at = id.lastIndexOf('@')
    const name = at > 0 ? id.slice(0, at) : id
    const marketplace = at > 0 ? id.slice(at + 1) : 'unknown'
    for (const e of list) {
      if (!isObj(e)) continue
      const scopeRaw = str(e.scope)
      out.push({
        id,
        name,
        marketplace,
        scope: scopeRaw === 'project' || scopeRaw === 'managed' ? scopeRaw : 'user',
        installPath: str(e.installPath) ?? '',
        version: str(e.version) ?? 'unknown',
        installedAt: str(e.installedAt),
        lastUpdated: str(e.lastUpdated),
        gitCommitSha: str(e.gitCommitSha),
      })
    }
  }
  return out
}

function marketplaceSource(raw: unknown): MarketplaceSource {
  const src = isObj(raw) && isObj(raw.source) ? raw.source : isObj(raw) ? raw : {}
  const kind = str(src.source)
  return {
    source: kind === 'github' || kind === 'git' || kind === 'directory' || kind === 'claudeai' ? kind : 'unknown',
    repo: str(src.repo),
    url: str(src.url),
    path: str(src.path),
  }
}

function manifestSummary(m: Record<string, unknown>): PluginManifestSummary {
  const author = isObj(m.author) ? str(m.author.name) : str(m.author)
  const declared = ['skills', 'commands', 'agents', 'hooks', 'mcpServers', 'lspServers', 'outputStyles', 'workflows'].filter((k) => m[k] !== undefined)
  return {
    name: str(m.name),
    version: str(m.version),
    description: str(m.description),
    author,
    homepage: str(m.homepage),
    repository: isObj(m.repository) ? str(m.repository.url) : str(m.repository),
    license: str(m.license),
    keywords: Array.isArray(m.keywords) ? m.keywords.filter((k): k is string => typeof k === 'string') : undefined,
    declaredComponents: declared,
  }
}

function asPathList(v: unknown, fallback: string[]): string[] {
  if (v === undefined) return fallback
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return fallback
}

export async function scanPlugins(ctx: ScanContext): Promise<void> {
  const pluginsDir = joinPath(ctx.paths.configDir, 'plugins')
  if (!(await dirExists(pluginsDir))) return
  const registry = ctx.b.node({
    id: ctx.ids.pluginRegistry,
    kind: 'pluginRegistry',
    label: 'Plugins',
    scope: 'user',
    layer: 'config',
    parentId: ctx.ids.machine,
    path: pluginsDir,
    summary: 'Installed plugins and the marketplaces they came from. A plugin is enabled through enabledPlugins in a settings file.',
    data: {},
  })

  const installedCfg = await readJsonConfig(ctx, joinPath(pluginsDir, 'installed_plugins.json'), { intendedKind: 'installed plugins registry', scope: 'user', parentId: registry.id })
  const installed = installedCfg ? readInstalled(installedCfg.value) : []

  // Marketplaces: known_marketplaces.json ∪ settings.extraKnownMarketplaces ∪ claude.ai synced rows.
  const marketplaces = new Map<string, Node<'marketplace'>>()
  const knownCfg = await readJsonConfig(ctx, joinPath(pluginsDir, 'known_marketplaces.json'), { intendedKind: 'known marketplaces', scope: 'user', parentId: registry.id })
  if (knownCfg) {
    for (const [name, raw] of Object.entries(knownCfg.value)) {
      const loc = isObj(raw) ? str(raw.installLocation) : undefined
      marketplaces.set(name, await emitMarketplace(ctx, registry.id, name, marketplaceSource(raw), loc ? normalizePath(loc, ctx.env.platform) : undefined, isObj(raw) ? str(raw.lastUpdated) : undefined, false))
    }
  }
  for (const settings of ctx.b.byKind('settings')) {
    const file = ctx.b.files[settings.fileId ?? '']
    if (!file?.content) continue
    try {
      const parsed = JSON.parse(file.content) as Record<string, unknown>
      if (!isObj(parsed.extraKnownMarketplaces)) continue
      for (const [name, raw] of Object.entries(parsed.extraKnownMarketplaces)) {
        if (marketplaces.has(name)) continue
        marketplaces.set(name, await emitMarketplace(ctx, registry.id, name, marketplaceSource(raw), joinPath(pluginsDir, 'marketplaces', name), undefined, true))
      }
    } catch {
      // settings content is normalized JSON; a parse failure here means it was not inlined
    }
  }
  const syncedDir = joinPath(pluginsDir, 'synced')
  if (await dirExists(syncedDir)) {
    for (const bucket of await readdirSorted(syncedDir)) {
      if (!bucket.isDirectory()) continue
      const cfg = await readJsonConfig(ctx, joinPath(syncedDir, bucket.name, '.marketplaces.json'), { intendedKind: 'synced marketplaces', scope: 'user', inline: false })
      const rows = Array.isArray(cfg?.value.rows) ? cfg.value.rows : []
      for (const row of rows) {
        if (!isObj(row) || typeof row.name !== 'string' || marketplaces.has(row.name)) continue
        marketplaces.set(row.name, await emitMarketplace(ctx, registry.id, row.name, { source: 'claudeai' }, undefined, str(row.updated_at), false))
      }
    }
  }

  // Installed plugins.
  const installedPaths = new Set<string>()
  for (const e of installed) {
    const installPath = normalizePath(e.installPath, ctx.env.platform)
    installedPaths.add(pathKey(installPath, ctx.env.platform))
    const plugin = await emitPlugin(ctx, registry.id, e, installPath, false)
    const mkt = marketplaces.get(e.marketplace)
    if (mkt) {
      ctx.b.edge({ kind: 'installedFrom', source: plugin.id, target: mkt.id })
      for (const c of mkt.data.catalog) if (c.name === e.name) c.installed = true
    } else {
      ctx.b.warn({ code: 'plugin.unknownMarketplace', severity: 'info', message: `plugin ${e.id} refers to marketplace "${e.marketplace}", which is not registered`, nodeId: plugin.id })
    }
  }

  // Orphaned cache dirs: plugins/cache/<marketplace>/<plugin>/<version>/ not in the registry.
  const cacheDir = joinPath(pluginsDir, 'cache')
  for (const mkt of await readdirSorted(cacheDir)) {
    if (!mkt.isDirectory()) continue
    for (const name of await readdirSorted(joinPath(cacheDir, mkt.name))) {
      if (!name.isDirectory()) continue
      for (const version of await readdirSorted(joinPath(cacheDir, mkt.name, name.name))) {
        if (!version.isDirectory()) continue
        const root = joinPath(cacheDir, mkt.name, name.name, version.name)
        if (installedPaths.has(pathKey(root, ctx.env.platform))) continue
        await emitPlugin(ctx, registry.id, { id: `${name.name}@${mkt.name}`, name: name.name, marketplace: mkt.name, scope: 'user', installPath: root, version: version.name }, root, true)
      }
    }
  }

  // Blocklist flags.
  const blockCfg = await readJsonConfig(ctx, joinPath(pluginsDir, 'blocklist.json'), { intendedKind: 'plugin blocklist', scope: 'user', inline: false })
  const blocked = Array.isArray(blockCfg?.value.plugins) ? blockCfg.value.plugins : []
  for (const b of blocked) {
    const id = isObj(b) ? str(b.plugin) : undefined
    if (!id) continue
    for (const p of ctx.b.byKind('plugin')) if (p.data.id === id) ctx.b.addFlag(p.id, 'blocked')
  }
}

async function emitMarketplace(ctx: ScanContext, registryId: string, name: string, source: MarketplaceSource, installLocation: string | undefined, lastUpdated: string | undefined, fromSettings: boolean): Promise<Node<'marketplace'>> {
  const loc = installLocation ?? joinPath(ctx.paths.configDir, 'plugins', 'marketplaces', name)
  const data: MarketplaceData = { name, source, installLocation, lastUpdated, catalogCount: 0, catalog: [], fromSettings }
  const catalogPath = joinPath(loc, '.claude-plugin', 'marketplace.json')
  const st = await statSafe(catalogPath)
  if (st?.isFile() && st.size <= 2 * 1024 * 1024) {
    const cfg = await readJsonConfig(ctx, catalogPath, { intendedKind: 'marketplace catalog', scope: 'marketplace', inline: false })
    const plugins = Array.isArray(cfg?.value.plugins) ? cfg.value.plugins : []
    for (const p of plugins) {
      if (!isObj(p) || typeof p.name !== 'string') continue
      data.catalog.push({ name: p.name, version: str(p.version), category: str(p.category), installed: false })
    }
    data.catalogCount = data.catalog.length
  }
  const where = source.source === 'github' ? `GitHub repo ${source.repo ?? ''}` : source.source === 'git' ? `git repo ${source.url ?? ''}` : source.source === 'directory' ? `local folder ${source.path ?? ''}` : source.source === 'claudeai' ? 'your claude.ai account' : 'an unknown source'
  return ctx.b.node({
    id: idOf('marketplace', ctx.idPath(loc)),
    kind: 'marketplace',
    label: name,
    scope: 'marketplace',
    layer: 'config',
    parentId: registryId,
    path: (await dirExists(loc)) ? loc : undefined,
    summary: `Plugin marketplace from ${where}; lists ${data.catalogCount} plugin${data.catalogCount === 1 ? '' : 's'} that can be installed.${fromSettings ? ' Declared in settings (extraKnownMarketplaces).' : ''}`,
    data,
  })
}

async function emitPlugin(ctx: ScanContext, registryId: string, e: InstalledEntry, root: string, orphan: boolean): Promise<Node<'plugin'>> {
  const exists = await dirExists(root)
  const counts: PluginCounts = { skills: 0, agents: 0, commands: 0, hookGroups: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 }
  const data: PluginData = {
    id: e.id,
    name: e.name,
    marketplace: e.marketplace,
    version: e.version,
    scope: e.scope,
    installPath: root,
    installPathExists: exists,
    registry: orphan ? undefined : { installedAt: e.installedAt, lastUpdated: e.lastUpdated, gitCommitSha: e.gitCommitSha },
    counts,
    unloadedDirs: [],
    userConfigKeys: [],
    heldByPids: [],
    orphan,
  }
  const flags: NonNullable<Node['flags']> = []
  if (orphan) flags.push('orphan', 'notLoaded')
  if (!exists) flags.push('missing')
  const node = ctx.b.node({
    id: idOf('plugin', ctx.idPath(root)),
    kind: 'plugin',
    label: e.name,
    scope: 'plugin',
    layer: 'config',
    parentId: registryId,
    path: root,
    summary: '',
    data,
    flags: flags.length > 0 ? flags : undefined,
  })
  if (!exists) {
    ctx.b.warn({ code: 'plugin.installPathMissing', severity: 'warn', message: `plugin ${e.id} install path ${root} does not exist`, path: root, nodeId: node.id })
    node.summary = `Plugin ${e.name} ${e.version} is registered but its files are missing; nothing from it loads.`
    return node
  }

  const manifestPath = joinPath(root, '.claude-plugin', 'plugin.json')
  const manifestCfg = await readJsonConfig(ctx, manifestPath, { intendedKind: 'plugin manifest', scope: 'plugin', parentId: node.id })
  const manifest = manifestCfg?.value ?? {}
  if (manifestCfg) {
    data.manifest = manifestSummary(manifest)
    data.userConfigKeys = isObj(manifest.userConfig) ? Object.keys(manifest.userConfig) : []
    ctx.b.node({
      id: idOf('pluginManifest', ctx.idPath(manifestPath)),
      kind: 'pluginManifest',
      label: 'plugin.json',
      scope: 'plugin',
      layer: 'config',
      parentId: node.id,
      path: manifestPath,
      fileId: manifestCfg.entry.id,
      summary: `Manifest declaring the plugin's name, version and where its components live${data.userConfigKeys.length > 0 ? `; asks the user for ${data.userConfigKeys.join(', ')}` : ''}.`,
      data: { manifest: data.manifest, userConfigKeys: data.userConfigKeys },
    })
  }

  if (orphan) {
    node.summary = `Older cached version ${e.version} of plugin ${e.name}; not in the installed registry, so nothing from it loads.`
    return node
  }

  const owner: ComponentOwner = { parentId: node.id, scope: 'plugin', origin: 'plugin', pluginName: e.name, pluginId: e.id }
  for (const rel of asPathList(manifest.skills, ['./skills/'])) {
    const abs = joinPath(root, rel.replace(/^\.\//, ''))
    if (await dirExists(abs)) counts.skills += (await scanSkillsDir(ctx, abs, owner)).length
    else if (await fileExists(abs)) counts.skills += (await scanSkillFile(ctx, abs, basenameOf(abs.replace(/\/SKILL\.md$/i, '')), owner)) ? 1 : 0
  }
  for (const rel of asPathList(manifest.commands, ['./commands/'])) {
    const abs = joinPath(root, rel.replace(/^\.\//, ''))
    if (await dirExists(abs)) counts.commands += (await scanCommandsDir(ctx, abs, owner)).length
    else if (await fileExists(abs)) counts.commands += (await scanCommandFile(ctx, abs, root, owner)) ? 1 : 0
  }
  for (const rel of asPathList(manifest.agents, ['./agents/'])) {
    const abs = joinPath(root, rel.replace(/^\.\//, ''))
    if (await dirExists(abs)) counts.agents += (await scanAgentsDir(ctx, abs, owner)).length
    else if (await fileExists(abs)) counts.agents += (await scanAgentFile(ctx, abs, owner)) ? 1 : 0
  }

  // Hooks: hooks/hooks.json by convention, plus manifest.hooks (inline object or file path).
  const hooksSources: { path?: string; obj?: unknown }[] = []
  const conventional = joinPath(root, 'hooks', 'hooks.json')
  if (await fileExists(conventional)) hooksSources.push({ path: conventional })
  if (typeof manifest.hooks === 'string') hooksSources.push({ path: joinPath(root, manifest.hooks.replace(/^\.\//, '')) })
  else if (isObj(manifest.hooks)) hooksSources.push({ obj: manifest.hooks })
  for (const src of hooksSources) {
    if (src.path) {
      if (pathKey(src.path, ctx.env.platform) !== pathKey(conventional, ctx.env.platform) && !(await fileExists(src.path))) continue
      const cfg = await readJsonConfig(ctx, src.path, { intendedKind: 'plugin hooks', scope: 'plugin', parentId: node.id })
      if (!cfg) continue
      const hooksObj = isObj(cfg.value.hooks) ? cfg.value.hooks : cfg.value
      const hf = ctx.b.node({
        id: idOf('hooksFile', ctx.idPath(src.path)),
        kind: 'hooksFile',
        label: basenameOf(src.path),
        scope: 'plugin',
        layer: 'config',
        parentId: node.id,
        path: src.path,
        fileId: cfg.entry.id,
        summary: '',
        data: { events: [], groupCount: 0, hookCount: 0 },
      })
      const res = emitHooks(ctx, hooksObj, { nodeId: hf.id, idPath: ctx.idPath(src.path), sourceKind: 'plugin', scope: 'plugin', path: src.path, fileId: cfg.entry.id })
      hf.data = { events: res.events, groupCount: res.groupCount, hookCount: res.hookCount }
      hf.summary = `${res.hookCount} hook${res.hookCount === 1 ? '' : 's'} in ${res.groupCount} matcher group${res.groupCount === 1 ? '' : 's'} across ${res.events.join(', ')}; active whenever the plugin is enabled.`
      counts.hookGroups += res.groupCount
    } else if (src.obj) {
      const res = emitHooks(ctx, src.obj, { nodeId: node.id, idPath: ctx.idPath(manifestPath), sourceKind: 'plugin', scope: 'plugin', path: manifestPath, fileId: manifestCfg?.entry.id })
      counts.hookGroups += res.groupCount
    }
  }

  // MCP servers: root .mcp.json is loaded even when the manifest says mcpServers: {} (observed); plus inline manifest entries.
  const mcpPath = joinPath(root, '.mcp.json')
  if (await fileExists(mcpPath)) {
    const cfg = await readJsonConfig(ctx, mcpPath, { intendedKind: 'plugin MCP servers', scope: 'plugin', parentId: node.id })
    const servers = cfg && isObj(cfg.value.mcpServers) ? cfg.value.mcpServers : {}
    for (const [name, raw] of Object.entries(servers)) {
      emitMcpServer(ctx, { name, raw, scopeKind: 'plugin', parentId: node.id, fileIdPath: ctx.idPath(mcpPath), path: mcpPath, scope: 'plugin', pluginName: e.name, pluginId: e.id })
      counts.mcpServers += 1
    }
  }
  if (isObj(manifest.mcpServers)) {
    for (const [name, raw] of Object.entries(manifest.mcpServers)) {
      if (typeof raw === 'string') continue // file reference; the conventional .mcp.json already covers the common case
      emitMcpServer(ctx, { name, raw, scopeKind: 'plugin', parentId: node.id, fileIdPath: ctx.idPath(manifestPath), path: manifestPath, scope: 'plugin', pluginName: e.name, pluginId: e.id })
      counts.mcpServers += 1
    }
  }

  // LSP servers.
  const lspPath = joinPath(root, '.lsp.json')
  const lspCfg = (await fileExists(lspPath)) ? await readJsonConfig(ctx, lspPath, { intendedKind: 'plugin LSP servers', scope: 'plugin', parentId: node.id }) : null
  const lspServers = lspCfg ? (isObj(lspCfg.value.lspServers) ? lspCfg.value.lspServers : lspCfg.value) : isObj(manifest.lspServers) ? manifest.lspServers : {}
  for (const [name, raw] of Object.entries(lspServers)) {
    if (!isObj(raw)) continue
    counts.lspServers += 1
    ctx.b.node({
      id: idOf('lspServer', ctx.idPath(lspCfg ? lspPath : manifestPath), name),
      kind: 'lspServer',
      label: name,
      scope: 'plugin',
      layer: 'config',
      parentId: node.id,
      path: lspCfg ? lspPath : manifestPath,
      summary: `Language server ${name} started by the plugin for code intelligence.`,
      data: { name, command: str(raw.command), args: Array.isArray(raw.args) ? raw.args.map(String) : undefined, extensionToLanguage: isObj(raw.extensionToLanguage) ? (raw.extensionToLanguage as Record<string, string>) : undefined },
    })
  }

  const stylesDir = joinPath(root, 'output-styles')
  if (await dirExists(stylesDir)) counts.outputStyles += (await scanOutputStylesDir(ctx, stylesDir, node.id, 'plugin')).length

  // Live sessions holding this version, per-plugin data dir, and look-alike dirs that are not loaded.
  const inUse = joinPath(root, '.in_use')
  if (await dirExists(inUse)) data.heldByPids = (await readdirSorted(inUse)).map((d) => Number(d.name)).filter((n) => Number.isInteger(n))
  const dataDir = joinPath(ctx.paths.configDir, 'plugins', 'data', `${e.name}-${e.marketplace}`)
  if (await dirExists(dataDir)) {
    const s = await dirSummary(dataDir)
    ctx.b.node({
      id: idOf('pluginData', ctx.idPath(dataDir)),
      kind: 'pluginData',
      label: `data/${e.name}-${e.marketplace}`,
      scope: 'plugin',
      layer: 'state',
      parentId: node.id,
      path: dataDir,
      summary: `Folder where plugin ${e.name} keeps its own saved data (${s.fileCount} files).`,
      data: { pluginId: e.id, fileCount: s.fileCount, totalBytes: s.totalBytes },
      stats: { fileCount: s.fileCount, sizeBytes: s.totalBytes },
    })
  }
  for (const d of UNLOADED_LOOKALIKES) if (await dirExists(joinPath(root, d))) data.unloadedDirs.push(d)

  const parts = [
    counts.skills > 0 ? `${counts.skills} skills` : '',
    counts.agents > 0 ? `${counts.agents} agents` : '',
    counts.commands > 0 ? `${counts.commands} commands` : '',
    counts.hookGroups > 0 ? `${counts.hookGroups} hook groups` : '',
    counts.mcpServers > 0 ? `${counts.mcpServers} MCP server${counts.mcpServers === 1 ? '' : 's'}` : '',
    counts.lspServers > 0 ? `${counts.lspServers} LSP servers` : '',
  ].filter((p) => p !== '')
  node.summary = `Plugin ${e.name} ${e.version} from marketplace ${e.marketplace}: ${parts.length > 0 ? parts.join(', ') : 'no components found'}. Every skill and agent description it contributes is in context on every turn.`
  return node
}

/** settings.enabledPlugins / pluginConfigs -> enables / disables / configures edges, with precedence. */
export function linkPluginEnablement(ctx: ScanContext): void {
  const plugins = ctx.b.byKind('plugin')
  const byId = new Map<string, Node<'plugin'>[]>()
  for (const p of plugins) byId.set(p.data.id, [...(byId.get(p.data.id) ?? []), p])
  const decided = new Map<string, number>()
  for (const settings of ctx.b.byKind('settings')) {
    const rank = SETTINGS_LEVEL_RANK[settings.data.level]
    for (const [id, enabled] of Object.entries(settings.data.enabledPlugins ?? {})) {
      let targets = (byId.get(id) ?? []).filter((p) => !p.data.orphan)
      if (targets.length === 0) {
        const ghostId = idOf('plugin', `ghost/${id}`)
        const ghost = (ctx.b.get(ghostId) as Node<'plugin'> | undefined) ?? ctx.b.node({
          id: ghostId,
          kind: 'plugin',
          label: id.split('@')[0] ?? id,
          scope: 'plugin',
          layer: 'config',
          parentId: ctx.ids.pluginRegistry,
          summary: `Listed in enabledPlugins but not installed, so nothing loads from it.`,
          data: { id, name: id.split('@')[0] ?? id, marketplace: id.split('@')[1] ?? 'unknown', version: 'unknown', scope: 'user', installPath: '', installPathExists: false, counts: { skills: 0, agents: 0, commands: 0, hookGroups: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 }, unloadedDirs: [], userConfigKeys: [], heldByPids: [], orphan: false },
          flags: ['ghost', 'missing'],
        })
        if (!ctx.b.has(ctx.ids.pluginRegistry)) delete ghost.parentId
        ctx.b.warn({ code: 'settings.enabledPluginNotInstalled', severity: 'warn', message: `${settings.path}: enabledPlugins lists ${id}, which is not installed`, path: settings.path, nodeId: ghost.id })
        targets = [ghost]
      }
      for (const p of targets) {
        ctx.b.edge({ kind: enabled ? 'enables' : 'disables', source: settings.id, target: p.id, label: `enabledPlugins`, data: { key: `enabledPlugins.${id}` } })
        if ((decided.get(p.id) ?? -1) < rank) {
          decided.set(p.id, rank)
          p.data.enabledInSettings = enabled
          if (!enabled) ctx.b.addFlag(p.id, 'disabled')
        }
      }
    }
    for (const [id, options] of Object.entries(settings.data.pluginConfigs ?? {})) {
      for (const p of byId.get(id) ?? []) {
        const opts = isObj(options) && isObj(options.options) ? (redactSecretsDeep(options.options) as Record<string, unknown>) : undefined
        p.data.configuredOptions = { ...p.data.configuredOptions, ...opts }
        ctx.b.edge({ kind: 'configures', source: settings.id, target: p.id, label: 'pluginConfigs', data: { key: `pluginConfigs.${id}`, options: opts } })
      }
    }
  }
  for (const p of plugins) {
    if (p.data.orphan || p.flags?.includes('ghost')) continue
    if (p.data.enabledInSettings === undefined) {
      p.data.enabledInSettings = false
      ctx.b.addFlag(p.id, 'disabled')
      ctx.b.warn({ code: 'plugin.notEnabled', severity: 'info', message: `plugin ${p.data.id} is installed but not listed in any enabledPlugins`, nodeId: p.id })
    }
  }
}
