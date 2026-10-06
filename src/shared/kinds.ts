// Closed vocabularies shared by the scanner (server) and the graph UI (web).
// Keep these lists authoritative: tests assert the glossary covers every node kind.

export const PLATFORMS = ['win32', 'darwin', 'linux'] as const
export type Platform = (typeof PLATFORMS)[number]

export const LAYERS = ['config', 'memory', 'sessions', 'plans', 'state'] as const
export type Layer = (typeof LAYERS)[number]

export const SCOPES = ['machine', 'managed', 'user', 'project', 'local', 'plugin', 'marketplace', 'cloud', 'desktop'] as const
export type Scope = (typeof SCOPES)[number]

export const LOAD_TIMINGS = ['startup', 'lazy', 'onInvoke', 'onEvent', 'never'] as const
export type LoadTiming = (typeof LOAD_TIMINGS)[number]

export const NODE_FLAGS = ['missing', 'broken', 'disabled', 'orphan', 'notLoaded', 'external', 'legacy', 'ghost', 'blocked', 'cliOnly'] as const
export type NodeFlag = (typeof NODE_FLAGS)[number]

export const CONTAINER_KINDS = [
  'machine', 'managedScope', 'userScope', 'pluginRegistry', 'project', 'worktree',
  'plugin', 'marketplace', 'syncedBucket', 'claudeDesktop', 'cloudConnectors', 'toolset',
] as const
export type ContainerKind = (typeof CONTAINER_KINDS)[number]

export const ARTIFACT_KINDS = [
  // settings and registry
  'settings', 'claudeJson', 'projectState', 'desktopConfig', 'pluginManifest', 'hooksFile', 'launchConfig', 'keybindings', 'outputStyle',
  // instructions
  'claudeMd', 'importedDoc', 'rulesFile',
  // permissions and tools
  'permissionRule', 'tool', 'unknownMcpServer',
  // hooks
  'hookEvent', 'hookGroup', 'hook',
  // mcp
  'mcpServer', 'connector', 'lspServer',
  // components
  'skill', 'command', 'agent',
  // memory
  'memoryIndex', 'memoryFile',
  // sessions
  'session', 'liveSession', 'logFile',
  // plans
  'plan',
  // state
  'stateDir', 'credentials', 'brokenFile', 'pluginData',
] as const
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]

export const NODE_KINDS = [...CONTAINER_KINDS, ...ARTIFACT_KINDS] as const
export type NodeKind = (typeof NODE_KINDS)[number]

export function isContainerKind(kind: NodeKind): kind is ContainerKind {
  return (CONTAINER_KINDS as readonly string[]).includes(kind)
}

export const EDGE_KINDS = [
  'contains', 'provides', 'loadsAtStartup', 'loadsLazily', 'imports', 'overrides', 'enables', 'disables', 'configures',
  'triggers', 'matches', 'allows', 'denies', 'asks', 'approves', 'rejects', 'surfacesAs', 'installedFrom', 'references',
  'recordsUsage', 'remembers', 'runsIn', 'writes', 'holds', 'nestedIn', 'sameProjectAs',
] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]

/** Edge kinds the UI never draws as lines because nesting already expresses them. */
export const IMPLIED_EDGE_KINDS: readonly EdgeKind[] = ['contains', 'provides', 'loadsAtStartup', 'loadsLazily', 'remembers', 'sameProjectAs']

/** Visual families used for colours, icons and the legend. */
export const FAMILIES = ['instructions', 'settings', 'hooks', 'mcp', 'plugins', 'skills', 'memory', 'sessions', 'cloud', 'scope', 'state'] as const
export type Family = (typeof FAMILIES)[number]

export const KIND_FAMILY: Record<NodeKind, Family> = {
  machine: 'scope', managedScope: 'scope', userScope: 'scope', pluginRegistry: 'plugins', project: 'scope', worktree: 'scope',
  plugin: 'plugins', marketplace: 'plugins', syncedBucket: 'plugins', claudeDesktop: 'cloud', cloudConnectors: 'cloud', toolset: 'mcp',
  settings: 'settings', claudeJson: 'settings', projectState: 'settings', desktopConfig: 'settings', pluginManifest: 'plugins',
  hooksFile: 'hooks', launchConfig: 'settings', keybindings: 'settings', outputStyle: 'instructions',
  claudeMd: 'instructions', importedDoc: 'instructions', rulesFile: 'instructions',
  permissionRule: 'settings', tool: 'mcp', unknownMcpServer: 'mcp',
  hookEvent: 'hooks', hookGroup: 'hooks', hook: 'hooks',
  mcpServer: 'mcp', connector: 'cloud', lspServer: 'mcp',
  skill: 'skills', command: 'skills', agent: 'skills',
  memoryIndex: 'memory', memoryFile: 'memory',
  session: 'sessions', liveSession: 'sessions', logFile: 'sessions',
  plan: 'memory',
  stateDir: 'state', credentials: 'state', brokenFile: 'state', pluginData: 'state',
}

export const EDGE_FAMILY: Record<EdgeKind, Family> = {
  contains: 'scope', provides: 'plugins', loadsAtStartup: 'instructions', loadsLazily: 'instructions', imports: 'instructions',
  overrides: 'settings', enables: 'plugins', disables: 'plugins', configures: 'settings', triggers: 'hooks', matches: 'hooks',
  allows: 'settings', denies: 'settings', asks: 'settings', approves: 'mcp', rejects: 'mcp', surfacesAs: 'mcp', installedFrom: 'plugins',
  references: 'skills', recordsUsage: 'state', remembers: 'memory', runsIn: 'sessions', writes: 'sessions', holds: 'sessions',
  nestedIn: 'scope', sameProjectAs: 'scope',
}

export const SETTINGS_LEVELS = ['managed', 'user', 'project', 'local'] as const
export type SettingsLevel = (typeof SETTINGS_LEVELS)[number]

/** Higher rank wins when the same key is set in several settings files. */
export const SETTINGS_LEVEL_RANK: Record<SettingsLevel, number> = { managed: 4, local: 3, project: 2, user: 1 }
