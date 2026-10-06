// Plain-English explanations for every node kind, edge kind and layer. Shown in the Inspector's Learn tab,
// the tour, the legend and "why is this here" sentences. A test asserts every NodeKind has an entry.
import type { EdgeKind, Layer, NodeKind } from './kinds.js'

export const DOCS_BASE = 'https://code.claude.com/docs/en/'

export function docsUrl(slug: string): string {
  return `${DOCS_BASE}${slug}`
}

export interface GlossaryEntry {
  title: string
  /** Two or three sentences a newcomer can follow. */
  what: string
  /** When Claude Code reads it. */
  loads: string
  /** Where it lives on disk (templates use ~). */
  lives: string
  /** Docs slug appended to DOCS_BASE. */
  docs: string
}

export const GLOSSARY: Record<NodeKind, GlossaryEntry> = {
  machine: { title: 'This machine', what: 'Everything Claude Code can read on this computer, grouped by who configured it: your organization, you, each project, installed extensions, and the tools Claude is allowed to use.', loads: 'Always', lives: 'Everywhere', docs: 'claude-directory' },
  managedScope: { title: 'Organization scope', what: 'Settings and instructions deployed by an administrator. They are enforced: nothing in your own files can override them.', loads: 'At startup, every session', lives: 'C:\\ProgramData\\ClaudeCode\\ or C:\\Program Files\\ClaudeCode\\ on Windows, /Library/Application Support/ClaudeCode/ on macOS, /etc/claude-code/ on Linux', docs: 'managed-settings' },
  userScope: { title: 'Your scope (~/.claude)', what: 'Your personal Claude Code configuration. Settings, instructions, skills and agents here apply to every project you open on this machine.', loads: 'At startup, every session', lives: '~/.claude/ (or $CLAUDE_CONFIG_DIR)', docs: 'claude-directory' },
  pluginRegistry: { title: 'Plugins', what: 'Installed plugins and the marketplaces they came from. A plugin only loads when a settings file lists it under enabledPlugins.', loads: 'Enabled plugins load at startup', lives: '~/.claude/plugins/', docs: 'plugins/overview' },
  project: { title: 'Project', what: 'A folder you ran Claude Code in. Its .claude/ folder and CLAUDE.md apply only when Claude runs inside it. Claude Code also remembers trust decisions, MCP approvals and session stats for it in ~/.claude.json.', loads: 'When you start Claude in this folder', lives: 'The folder itself, plus ~/.claude.json and ~/.claude/projects/<encoded path>/', docs: 'settings' },
  worktree: { title: 'Worktree', what: 'A git worktree Claude created so a parallel task could work on its own checkout. It can carry its own CLAUDE.md and settings, but shares the repository and its auto-memory.', loads: 'When Claude works inside it', lives: '<project>/.claude/worktrees/<name>/', docs: 'common-workflows' },
  plugin: { title: 'Plugin', what: 'A directory of skills, agents, hooks and MCP servers installed as one unit from a marketplace and switched on with enabledPlugins in a settings file. Every skill and agent description it contains sits in context on every turn, so large plugins cost tokens even when idle.', loads: 'At startup when enabled', lives: '~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/', docs: 'plugins/overview' },
  marketplace: { title: 'Plugin marketplace', what: 'A git repository or folder whose .claude-plugin/marketplace.json lists plugins and where to fetch them. The official Anthropic marketplace is added automatically; others come from extraKnownMarketplaces or /plugin marketplace add.', loads: 'When installing or updating plugins', lives: '~/.claude/plugins/marketplaces/<name>/', docs: 'plugins/overview' },
  syncedBucket: { title: 'claude.ai synced skills', what: 'Skills synced from your claude.ai account, keyed by organization and account. They update on their own and show up as /anthropic-skills:<name>.', loads: 'At startup', lives: '~/.claude/skills/synced/<org>_<account>/', docs: 'skills' },
  claudeDesktop: { title: 'Claude Desktop', what: 'The separate desktop chat app keeps its own MCP configuration. Claude Code does not read it, although `claude mcp add-from-claude-desktop` can import those servers.', loads: 'Not loaded by Claude Code', lives: '%APPDATA%\\Claude\\ on Windows, ~/Library/Application Support/Claude/ on macOS', docs: 'mcp' },
  cloudConnectors: { title: 'claude.ai connectors', what: 'Remote MCP servers you connected in your claude.ai account. They have no local configuration file; Claude Code fetches them at session start when you are signed in.', loads: 'At session start, over the network', lives: 'Your claude.ai account', docs: 'mcp' },
  toolset: { title: 'Tools and events', what: 'The sink of the graph: built-in tools (Bash, Edit, Read...), MCP tool-name prefixes, and the lifecycle events hooks attach to. Permission rules and hook matchers point here.', loads: 'Always', lives: 'Built into Claude Code', docs: 'permissions' },
  settings: { title: 'Settings file', what: 'JSON that controls what Claude may do without asking, which hooks run, which plugins are enabled and which environment variables are set. The same key can appear in several files: the higher scope wins, except list keys like permissions.allow, which merge. Highest to lowest: managed, project local, shared project, user.', loads: 'At startup; most edits hot-reload', lives: '~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json, managed-settings.json', docs: 'settings' },
  claudeJson: { title: '~/.claude.json (state file)', what: 'Claude Code\'s runtime state, not the same as settings.json: per-project entries (trust, MCP approvals, local servers, last cost), user-scope MCP servers, usage counters and sign-in details. claude-mri reads only an allowlist of keys from it.', loads: 'At startup', lives: '~/.claude.json', docs: 'settings' },
  projectState: { title: 'Project state entry', what: 'What Claude Code remembers about one folder inside ~/.claude.json: whether you trusted it, which .mcp.json servers you approved or rejected, local MCP servers, and last-session statistics.', loads: 'At startup in that folder', lives: '~/.claude.json under projects["<path>"]', docs: 'mcp' },
  desktopConfig: { title: 'Claude Desktop config', what: 'claude_desktop_config.json holds the MCP servers for the desktop chat app. Claude Code ignores it.', loads: 'Not loaded by Claude Code', lives: '%APPDATA%\\Claude\\claude_desktop_config.json', docs: 'mcp' },
  pluginManifest: { title: 'Plugin manifest', what: 'plugin.json declares a plugin\'s name, version, author and where its components live. Most components are discovered by convention (skills/, agents/, commands/, hooks/hooks.json, .mcp.json).', loads: 'At startup when the plugin is enabled', lives: '<plugin>/.claude-plugin/plugin.json', docs: 'plugins/manifest-reference' },
  hooksFile: { title: 'Plugin hooks file', what: 'hooks/hooks.json inside a plugin: the lifecycle hooks the plugin installs. They run as you whenever the plugin is enabled, so review third-party hooks.', loads: 'Registered at startup', lives: '<plugin>/hooks/hooks.json', docs: 'hooks' },
  launchConfig: { title: 'Launch configuration', what: '.claude/launch.json tells the Desktop and IDE Launch panel how to start your dev server for previews (name, command, port). The terminal CLI does not read it.', loads: 'When you start a preview', lives: '<project>/.claude/launch.json', docs: 'desktop' },
  keybindings: { title: 'Keybindings', what: 'Your terminal shortcut overrides, created with /keybindings.', loads: 'At startup', lives: '~/.claude/keybindings.json', docs: 'keybindings' },
  outputStyle: { title: 'Output style', what: 'A markdown file that rewrites the tone-and-format part of the system prompt (not Claude\'s knowledge). Selected with /config, which stores outputStyle in settings.', loads: 'At startup, selected style only', lives: '~/.claude/output-styles/*.md or .claude/output-styles/', docs: 'output-styles' },
  claudeMd: { title: 'CLAUDE.md instructions', what: 'Plain-markdown instructions Claude reads at the start of every session: coding standards, architecture notes, review rules. Files from the filesystem root down to the working folder are concatenated; CLAUDE.local.md is your private, git-ignored variant. @path lines import other files, which is why a one-line @AGENTS.md is common.', loads: 'At launch; files in subfolders load when Claude works there', lives: '~/.claude/CLAUDE.md, ./CLAUDE.md or ./.claude/CLAUDE.md, ./CLAUDE.local.md', docs: 'memory' },
  importedDoc: { title: 'Imported document', what: 'A file pulled into the instructions by an @path line. Claude reads it at launch as if it were part of the importing CLAUDE.md. Imports nest up to about five levels.', loads: 'At launch, with its importer', lives: 'Wherever the @path points', docs: 'memory' },
  rulesFile: { title: 'Rules file', what: 'A topic-sized instruction file in a .claude/rules/ folder. All .md files there load like CLAUDE.md; with paths: frontmatter a rule loads only when Claude works on matching files.', loads: 'At launch, or on demand when path-scoped', lives: '.claude/rules/**/*.md, ~/.claude/rules/', docs: 'memory' },
  permissionRule: { title: 'Permission rule', what: 'A Tool(specifier) pattern such as Bash(npm run *), Read(./.env) or mcp__github__* placed in permissions.allow, ask or deny. Rules from every scope merge, and deny always beats allow. Answering "Yes, don\'t ask again" writes an allow rule into .claude/settings.local.json.', loads: 'At startup; hot-reloaded', lives: 'Inside any settings file under permissions', docs: 'permissions' },
  tool: { title: 'Tool', what: 'A built-in capability (Bash, Edit, Read, WebFetch...) or an MCP tool-name prefix. Permission rules and hook matchers refer to tools by these names.', loads: 'Always available unless denied', lives: 'Built into Claude Code or provided by an MCP server', docs: 'permissions' },
  unknownMcpServer: { title: 'Unknown MCP server', what: 'A server referenced by a permission rule or approval that is not defined in any scanned configuration. Often an old server you removed, or a claude.ai connector addressed by its internal id.', loads: 'Never (nothing to load)', lives: 'Only as a reference in a settings file', docs: 'mcp' },
  hookEvent: { title: 'Hook event', what: 'A lifecycle moment Claude Code announces, such as PreToolUse, PostToolUse, UserPromptSubmit, Stop or SessionStart. Hooks attach to events, optionally with a tool-name matcher.', loads: 'Fires during the session', lives: 'Key under hooks in a settings file or plugin hooks.json', docs: 'hooks' },
  hookGroup: { title: 'Hook matcher group', what: 'One entry under an event: a matcher (a regex over tool names; empty means every tool) and the list of hooks to run when it matches.', loads: 'Registered at startup', lives: 'hooks.<Event>[] in a settings file or plugin', docs: 'hooks' },
  hook: { title: 'Hook', what: 'A command (or http, prompt or agent handler) that runs when its event fires and the matcher matches. It receives JSON on stdin; exit code 2 blocks the action and JSON output can allow, deny or add context. Hooks run as you.', loads: 'Runs on its event', lives: 'settings hooks, plugin hooks/hooks.json, skill or agent frontmatter', docs: 'hooks' },
  mcpServer: { title: 'MCP server', what: 'An external tool server Claude can call. Scopes: local (~/.claude.json, this project only), project (.mcp.json, shared and needing one-time approval), user (~/.claude.json, every project), plugin-bundled, claude.ai connectors and managed. Its tools appear as mcp__<server>__<tool>.', loads: 'Connected at session start', lives: '~/.claude.json, ./.mcp.json, <plugin>/.mcp.json', docs: 'mcp' },
  connector: { title: 'claude.ai connector', what: 'A remote MCP server connected in your claude.ai account; fetched at session start when signed in and treated like a user-scope server. Its tools appear as mcp__claude_ai_<Name>__*.', loads: 'At session start, over the network', lives: 'Your claude.ai account (no local file)', docs: 'mcp' },
  lspServer: { title: 'Language server', what: 'A language server a plugin starts to give Claude code intelligence for certain file types.', loads: 'When matching files are opened', lives: '<plugin>/.lsp.json', docs: 'plugins/manifest-reference' },
  skill: { title: 'Skill', what: 'A SKILL.md with frontmatter and instructions. Its description is loaded at startup so Claude knows when to use it; the body loads when invoked. Plugin skills are namespaced /plugin:skill; claude.ai-synced ones are /anthropic-skills:<name>.', loads: 'Description at startup, body on invoke', lives: '~/.claude/skills/<name>/SKILL.md, .claude/skills/, <plugin>/skills/', docs: 'skills' },
  command: { title: 'Slash command (legacy)', what: 'A markdown prompt in a commands/ folder, run as /name (subfolders become /folder:name). Still supported, but skills are the newer form.', loads: 'Listed at startup, body on invoke', lives: '.claude/commands/*.md, ~/.claude/commands/, <plugin>/commands/', docs: 'skills' },
  agent: { title: 'Subagent', what: 'A markdown file describing a specialist Claude can delegate to in its own context window, with its own tool allowlist, model and permission mode.', loads: 'Description at startup; runs when delegated', lives: '.claude/agents/*.md, ~/.claude/agents/, <plugin>/agents/', docs: 'sub-agents' },
  memoryIndex: { title: 'Auto-memory index', what: 'MEMORY.md is the index of notes Claude writes for itself about a repository: preferences, corrections, learnings. Its first 200 lines load into every session there; topic files load on demand.', loads: 'At launch (index only)', lives: '~/.claude/projects/<encoded path>/memory/MEMORY.md', docs: 'memory' },
  memoryFile: { title: 'Memory note', what: 'A detail note referenced from MEMORY.md. Claude reads it only when the index points at something relevant.', loads: 'On demand', lives: '~/.claude/projects/<encoded path>/memory/*.md', docs: 'memory' },
  session: { title: 'Session transcript', what: 'The JSONL record of one conversation, used by claude --resume and --continue and for checkpoint rewinds. Deleted after cleanupPeriodDays.', loads: 'Read when you resume', lives: '~/.claude/projects/<encoded path>/<session-id>.jsonl', docs: 'checkpointing' },
  liveSession: { title: 'Running session', what: 'A Claude Code process currently running (or recently exited) on this machine, with the folder it was started in.', loads: 'Now', lives: '~/.claude/sessions/<pid>.json', docs: 'cli-reference' },
  logFile: { title: 'Log or history file', what: 'history.jsonl is your prompt history used by the prompt picker; other logs are usually written by plugin hooks. claude-mri never reads prompt text, only counts.', loads: 'history.jsonl is read by the prompt picker', lives: '~/.claude/history.jsonl and ~/.claude/*.log', docs: 'claude-directory' },
  plan: { title: 'Plan file', what: 'The markdown plan Claude writes in Plan Mode before touching code. You approve it, then it is implemented; the file stays so you can revisit the reasoning.', loads: 'Written and read during Plan Mode', lives: '~/.claude/plans/<slug>.md', docs: 'common-workflows' },
  stateDir: { title: 'State folder', what: 'Runtime residue Claude Code or plugins keep under ~/.claude: caches, metrics, shell snapshots, file history for rewinds. Safe to ignore when learning the configuration.', loads: 'Written during sessions', lives: '~/.claude/<folder>/', docs: 'claude-directory' },
  credentials: { title: 'Credentials', what: 'Your sign-in tokens. claude-mri never opens this file; it only notes that it exists.', loads: 'At startup, by Claude Code only', lives: '~/.claude/.credentials.json', docs: 'authentication' },
  brokenFile: { title: 'Broken config file', what: 'A configuration file that failed to parse. Claude Code ignores it and reports a settings error, so nothing in it takes effect until it is fixed.', loads: 'Never (invalid)', lives: 'Where it was found', docs: 'troubleshooting' },
  pluginData: { title: 'Plugin data folder', what: 'A folder where a plugin keeps its own saved data between sessions.', loads: 'By the plugin', lives: '~/.claude/plugins/data/<plugin>-<marketplace>/', docs: 'plugins/overview' },
}

export const EDGE_GLOSSARY: Record<EdgeKind, string> = {
  contains: 'is inside',
  provides: 'is provided by',
  loadsAtStartup: 'loads at startup',
  loadsLazily: 'loads on demand',
  imports: 'imports with @path',
  overrides: 'takes precedence over',
  enables: 'enables',
  disables: 'disables',
  configures: 'configures',
  triggers: 'triggers',
  matches: 'runs for tool',
  allows: 'allows without asking',
  denies: 'blocks',
  asks: 'always asks before',
  approves: 'approved',
  rejects: 'rejected',
  surfacesAs: 'appears to Claude as',
  installedFrom: 'installed from',
  references: 'references',
  recordsUsage: 'records usage of',
  remembers: 'has auto-memory',
  runsIn: 'is running in',
  writes: 'writes transcript',
  holds: 'is using plugin',
  nestedIn: 'is a subfolder of',
  sameProjectAs: 'is the same project as',
}

export const LAYER_GLOSSARY: Record<Layer, { title: string; what: string }> = {
  config: { title: 'Configuration', what: 'Files that change how Claude behaves: instructions, settings, hooks, MCP servers, plugins, skills and agents.' },
  memory: { title: 'Memory', what: 'Notes Claude writes for itself per project (MEMORY.md and topic files).' },
  sessions: { title: 'Sessions', what: 'Conversation transcripts, running processes and your prompt history.' },
  plans: { title: 'Plans', what: 'Plan Mode documents Claude wrote before implementing changes.' },
  state: { title: 'State', what: 'Caches, metrics and other runtime residue. Useful for "where does my data live", not for learning configuration.' },
}
