// Kind-specific node data: plugins, marketplaces, skills, agents, commands.

export interface PluginCounts {
  skills: number
  agents: number
  commands: number
  hookGroups: number
  mcpServers: number
  lspServers: number
  outputStyles: number
}

export interface PluginManifestSummary {
  name?: string
  version?: string
  description?: string
  author?: string
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  /** Component keys the manifest declares explicitly (skills, commands, agents, hooks, mcpServers, ...). */
  declaredComponents: string[]
}

export interface PluginCliInfo {
  enabled: boolean
  notes: string[]
  projectEnabled: boolean
  hasUserConfig: boolean
}

export interface PluginData {
  /** `name@marketplace` */
  id: string
  name: string
  marketplace: string
  version: string
  scope: 'user' | 'project' | 'managed'
  installPath: string
  installPathExists: boolean
  enabledInSettings?: boolean
  registry?: { installedAt?: string; lastUpdated?: string; gitCommitSha?: string }
  manifest?: PluginManifestSummary
  counts: PluginCounts
  unloadedDirs: string[]
  userConfigKeys: string[]
  configuredOptions?: Record<string, unknown>
  cli?: PluginCliInfo
  heldByPids: number[]
  orphan: boolean
  unmatchedComponents?: string[]
}

export interface PluginManifestData {
  manifest: PluginManifestSummary
  userConfigKeys: string[]
}

export interface HooksFileData {
  events: string[]
  groupCount: number
  hookCount: number
}

export interface MarketplaceSource {
  source: 'github' | 'git' | 'directory' | 'claudeai' | 'unknown'
  repo?: string
  url?: string
  path?: string
}

export interface MarketplaceCatalogEntry {
  name: string
  version?: string
  category?: string
  installed: boolean
}

export interface MarketplaceData {
  name: string
  source: MarketplaceSource
  installLocation?: string
  lastUpdated?: string
  catalogCount: number
  catalog: MarketplaceCatalogEntry[]
  fromSettings: boolean
}

export interface SyncedBucketData {
  bucket: string
  org?: string
  account?: string
  skillCount: number
  lastUpdated?: string
}

export type ComponentOrigin = 'personal' | 'project' | 'plugin' | 'synced'

export interface SkillData {
  name: string
  description?: string
  /** How the user invokes it, e.g. "/ecc:tdd-workflow". */
  invocation: string
  origin: ComponentOrigin
  pluginId?: string
  bucket?: string
  frontmatter: Record<string, unknown>
  allowedTools?: string[]
  userInvocable?: boolean
  disableModelInvocation?: boolean
  context?: string
  model?: string
  paths?: string[]
  hasHooks: boolean
  statsAmbiguous?: boolean
}

export interface AgentData {
  name: string
  description?: string
  origin: ComponentOrigin
  pluginId?: string
  tools?: string[]
  disallowedTools?: string[]
  model?: string
  permissionMode?: string
  skills?: string[]
  mcpServers?: string[]
  memory?: string
  frontmatter: Record<string, unknown>
  hasHooks: boolean
}

export interface CommandData {
  name: string
  namespace?: string
  description?: string
  invocation: string
  origin: ComponentOrigin
  pluginId?: string
  frontmatter: Record<string, unknown>
  statsAmbiguous?: boolean
}

export interface PluginDataDirData {
  pluginId: string
  fileCount: number
  totalBytes: number
}
