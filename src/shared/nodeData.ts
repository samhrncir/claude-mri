// Maps each node kind to its data shape. Kinds without a specific shape carry a generic record.
import type { NodeKind } from './kinds.js'
import type {
  ClaudeJsonData, ClaudeMdData, ConnectorData, HookData, HookEventData, HookGroupData, ImportedDocData,
  LaunchConfigData, LspServerData, McpServerData, PermissionRuleData, ProjectData, ProjectStateData,
  RulesFileData, SettingsData, ToolData, UnknownMcpServerData, WorktreeData,
} from './data-config.js'
import type {
  AgentData, CommandData, HooksFileData, MarketplaceData, PluginData, PluginDataDirData, PluginManifestData,
  SkillData, SyncedBucketData,
} from './data-extensions.js'
import type {
  BrokenFileData, CredentialsData, LiveSessionData, LogFileData, MemoryFileData, MemoryIndexData, PlanData,
  SessionData, StateDirData,
} from './data-runtime.js'

export type GenericData = Record<string, unknown>

export interface KnownNodeData {
  settings: SettingsData
  project: ProjectData
  worktree: WorktreeData
  projectState: ProjectStateData
  claudeJson: ClaudeJsonData
  desktopConfig: SettingsData
  claudeMd: ClaudeMdData
  importedDoc: ImportedDocData
  rulesFile: RulesFileData
  permissionRule: PermissionRuleData
  hookEvent: HookEventData
  hookGroup: HookGroupData
  hook: HookData
  mcpServer: McpServerData
  connector: ConnectorData
  unknownMcpServer: UnknownMcpServerData
  tool: ToolData
  lspServer: LspServerData
  launchConfig: LaunchConfigData
  plugin: PluginData
  pluginManifest: PluginManifestData
  hooksFile: HooksFileData
  marketplace: MarketplaceData
  syncedBucket: SyncedBucketData
  skill: SkillData
  agent: AgentData
  command: CommandData
  pluginData: PluginDataDirData
  memoryIndex: MemoryIndexData
  memoryFile: MemoryFileData
  session: SessionData
  liveSession: LiveSessionData
  logFile: LogFileData
  plan: PlanData
  stateDir: StateDirData
  credentials: CredentialsData
  brokenFile: BrokenFileData
}

export type NodeData<K extends NodeKind> = K extends keyof KnownNodeData ? KnownNodeData[K] : GenericData

export type AnyNodeData = NodeData<NodeKind>

export * from './data-config.js'
export * from './data-extensions.js'
export * from './data-runtime.js'
