// Kind-specific node data: settings, projects, instructions, permissions, hooks, MCP.
import type { SettingsLevel } from './kinds.js'
import type { EffectiveView } from './snapshot.js'

export interface SettingsData {
  level: SettingsLevel
  keys: string[]
  unknownKeys: string[]
  permissions?: { allow: number; deny: number; ask: number; defaultMode?: string; additionalDirectories?: string[] }
  hookGroups: number
  env?: Record<string, string>
  model?: string
  effortLevel?: string
  enabledPlugins?: Record<string, boolean>
  pluginConfigs?: Record<string, unknown>
  disableAllHooks?: boolean
  outputStyle?: string
  autoMemoryEnabled?: boolean
  hasStatusLine?: boolean
}

export type ProjectSource = 'claudeJson' | 'transcripts' | 'history' | 'rootScan' | 'uiRoot' | 'liveSession' | 'github'

export interface ProjectData {
  path: string
  exists: boolean
  isHome: boolean
  sources: ProjectSource[]
  registryKeys: string[]
  gitRemote?: string
  encodedDirName?: string
  effective: EffectiveView
  worktreeCount: number
  sessionCount: number
  memoryFileCount: number
  lastCostUSD?: number
  lastSessionId?: string
}

export interface WorktreeData {
  name: string
  gitdir?: string
  branch?: string
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  costUSD: number
}

export interface ProjectStateData {
  allowedTools: string[]
  enabledMcpjsonServers: string[]
  disabledMcpjsonServers: string[]
  mcpContextUris: string[]
  localMcpServers: string[]
  hasTrustDialogAccepted?: boolean
  hasClaudeMdExternalIncludesApproved?: boolean
  lastCost?: number
  lastDuration?: number
  lastSessionId?: string
  lastModelUsage?: Record<string, ModelUsage>
}

export interface ClaudeJsonData {
  keyCount: number
  extractedKeys: string[]
  projectCount: number
  userMcpServers: string[]
  connectors: string[]
  installMethod?: string
  numStartups?: number
  firstStartTime?: string
}

export type ClaudeMdRole = 'managed' | 'user' | 'project' | 'local' | 'parent' | 'nested' | 'worktree'

export interface ImportRef {
  raw: string
  line: number
  resolved?: string
  missing: boolean
  external: boolean
}

export interface ClaudeMdData {
  role: ClaudeMdRole
  lines: number
  imports: ImportRef[]
  isImportOnly: boolean
}

export interface ImportedDocData {
  lines: number
  imports: ImportRef[]
}

export interface RulesFileData {
  paths?: string[]
  lazy: boolean
  frontmatter: Record<string, unknown>
}

export type McpNameKind = 'plain' | 'plugin' | 'connector' | 'opaque'

export interface PermissionRuleData {
  list: 'allow' | 'deny' | 'ask'
  raw: string
  tool: string
  pattern?: string
  mcp?: { server: string; tool?: string; kind: McpNameKind; pluginName?: string }
  resolvedTargetId?: string
  legacy?: boolean
}

export interface HookEventData {
  event: string
  known: boolean
  toolEvent: boolean
  groupCount: number
  sources: string[]
}

export type HookSourceKind = 'settings' | 'plugin' | 'skill' | 'agent'

export interface HookGroupData {
  event: string
  matcher?: string
  matcherValid: boolean
  hookCount: number
  sourceKind: HookSourceKind
  matchedTools: string[]
}

export interface HookData {
  type: 'command' | 'prompt' | 'agent' | 'http' | 'mcp_tool' | 'unknown'
  command?: string
  prompt?: string
  url?: string
  server?: string
  tool?: string
  timeout?: number
  async?: boolean
  statusMessage?: string
}

export type McpScopeKind = 'user' | 'project' | 'local' | 'plugin' | 'desktop' | 'managed'
export type McpTransport = 'stdio' | 'http' | 'sse' | 'ws' | 'unknown'

export interface McpServerData {
  scopeKind: McpScopeKind
  name: string
  transport: McpTransport
  command?: string
  args?: string[]
  url?: string
  envKeys: string[]
  headerKeys: string[]
  redactedKeys: string[]
  /** `${VAR}` references found in command, args, env, url or headers. */
  placeholders: string[]
  toolPrefix?: string
  approval?: 'enabled' | 'disabled' | 'pending' | 'n/a'
  health?: 'connected' | 'failed' | 'unknown'
  pluginId?: string
  cliConfirmed?: boolean
}

export interface ConnectorData {
  displayName: string
  toolPrefix: string
}

export interface UnknownMcpServerData {
  server: string
  referencedBy: string[]
}

export interface ToolData {
  builtin: boolean
  mcp?: { server: string; tool?: string; prefix?: string }
}

export interface LspServerData {
  name: string
  command?: string
  args?: string[]
  extensionToLanguage?: Record<string, string>
}

export interface LaunchConfigData {
  version?: string
  configurations: { name: string; type?: string; port?: number; runtimeExecutable?: string }[]
}
