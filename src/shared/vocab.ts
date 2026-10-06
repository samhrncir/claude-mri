// Claude Code vocabularies the scanner matches against: hook events, built-in tools, settings keys.

/** All hook lifecycle events known to Claude Code 2.1.x. */
export const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'UserPromptSubmit', 'UserPromptExpansion',
  'Notification', 'MessageDisplay', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'SessionStart', 'SessionEnd',
  'Setup', 'PreCompact', 'PostCompact', 'PermissionRequest', 'PermissionDenied', 'ConfigChange', 'InstructionsLoaded',
  'CwdChanged', 'DirectoryAdded', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'PreModelSwitch', 'PostModelSwitch',
  'Elicitation', 'ElicitationResult', 'TaskCreated', 'TaskCompleted', 'TeammateIdle',
] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export function isKnownHookEvent(event: string): event is HookEvent {
  return (HOOK_EVENTS as readonly string[]).includes(event)
}

/** Events whose `matcher` is a regex over tool names. */
export const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied'] as const

export function isToolEvent(event: string): boolean {
  return (TOOL_EVENTS as readonly string[]).includes(event)
}

/** Built-in tools that permission rules and hook matchers refer to by name. */
export const BUILTIN_TOOLS = [
  'Bash', 'PowerShell', 'Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch',
  'Task', 'Agent', 'Skill', 'TodoWrite', 'ExitPlanMode', 'AskUserQuestion', 'EnterWorktree', 'ExitWorktree', 'SendMessage',
  'Monitor', 'TaskStop',
] as const
export type BuiltinTool = (typeof BUILTIN_TOOLS)[number]

/** Top-level settings keys documented for Claude Code; anything else is reported as unknown. */
export const KNOWN_SETTINGS_KEYS = [
  'permissions', 'hooks', 'env', 'model', 'fallbackModel', 'effortLevel', 'modelSettings', 'enabledPlugins', 'pluginConfigs',
  'extraKnownMarketplaces', 'strictKnownMarketplaces', 'blockedMarketplaces', 'statusLine', 'attribution', 'includeCoAuthoredBy',
  'includeGitInstructions', 'cleanupPeriodDays', 'autoMemoryEnabled', 'autoMemoryDirectory', 'disabledMcpServers',
  'enabledMcpServers', 'enableAllProjectMcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers', 'allowedMcpServers',
  'deniedMcpServers', 'allowManagedMcpServersOnly', 'managedMcpServers', 'disableClaudeAiConnectors', 'outputStyle',
  'disableAllHooks', 'allowManagedHooksOnly', 'disableBundledSkills', 'skillOverrides', 'syncClaudeAiSkills', 'syncClaudeAiPlugins',
  'autoCompactWindow', 'apiKeyHelper', 'forceLoginMethod', 'autoMode', 'tui', 'agent', 'subagentStatusLine',
  'skipWorkflowUsageWarning', 'inputNeededNotifEnabled', 'agentPushNotifEnabled', 'claudeMd', '$schema',
] as const

/** Directories under ~/.claude that hold runtime residue rather than configuration. */
export const STATE_DIRS: Record<string, string> = {
  state: 'Small runtime state files written by Claude Code and plugins',
  cache: 'Cached downloads such as the changelog and model catalog',
  metrics: 'Cost and usage metrics',
  'session-data': 'Session summaries written by plugins',
  'session-env': 'Per-session environment folders',
  'file-history': 'Snapshots of files edited in each session (used for rewinds)',
  'shell-snapshots': 'Captured shell environment per session',
  backups: 'Rotating backups of ~/.claude.json',
  'paste-cache': 'Large pasted inputs',
  feedback: 'Feedback drafts',
  chrome: 'Claude in Chrome native host',
  todos: 'Task lists',
  debug: 'Debug logs',
  statsig: 'Feature flag cache',
  telemetry: 'Telemetry buffers',
  ide: 'IDE integration lock files',
}
