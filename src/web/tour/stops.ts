// Guided tour stops. Each picks the nodes to frame from the snapshot indexes and degrades when none exist.
import type { Layer, NodeKind } from '../../shared/kinds.js'
import type { Indexes } from '../store/types.js'

export interface TourStop {
  id: string
  title: string
  body: string
  /** Node ids to frame and highlight. */
  pick(indexes: Indexes): string[]
  /** Layers that must be visible for this stop. */
  layers?: Layer[]
  empty: string
  learnKind: NodeKind
}

function ofKind(indexes: Indexes, ...kinds: NodeKind[]): string[] {
  const out: string[] = []
  for (const n of indexes.byId.values()) if (kinds.includes(n.kind)) out.push(n.id)
  return out
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'machine',
    title: 'Where Claude Code looks',
    body: 'Everything Claude Code reads on this computer is laid out left to right by who configured it: your organization, you, each project folder, installed extensions, and finally the tools Claude is allowed to use. Lines flow rightwards, so following an arrow answers "what does this control?".',
    pick: (i) => i.topLevel,
    empty: 'Nothing has been scanned yet.',
    learnKind: 'machine',
  },
  {
    id: 'instructions',
    title: 'Instructions: CLAUDE.md',
    body: 'CLAUDE.md files hold plain-markdown instructions. Your personal one in ~/.claude applies everywhere; a project\'s CLAUDE.md applies only in that folder; CLAUDE.local.md is your private, git-ignored variant. Amber lines are @imports: one file pulling another into the instructions at launch.',
    pick: (i) => ofKind(i, 'claudeMd', 'importedDoc', 'rulesFile'),
    empty: 'You have no CLAUDE.md files yet. Create one with /init inside a project, or write ~/.claude/CLAUDE.md for personal preferences.',
    learnKind: 'claudeMd',
  },
  {
    id: 'settings',
    title: 'Settings and permissions',
    body: 'Settings files decide what Claude may do without asking, which hooks run and which plugins are on. Inside a project they stack: the local file wins over the shared project file, which wins over your user file; organization settings win over everything. The "overrides" lines show that ladder. Each pill is one permission rule.',
    pick: (i) => ofKind(i, 'settings', 'permissionRule'),
    empty: 'No settings files were found. Claude Code creates ~/.claude/settings.json the first time you change a setting.',
    learnKind: 'settings',
  },
  {
    id: 'hooks',
    title: 'Hooks',
    body: 'Hooks are scripts Claude Code runs at lifecycle moments such as before a tool call or when a turn ends. Purple lines connect each hook to the tools its matcher selects, and to the event that triggers it. Hooks come from settings files or from plugins, and they run as you.',
    pick: (i) => ofKind(i, 'hook', 'hookGroup', 'hookEvent', 'hooksFile'),
    empty: 'No hooks are configured. Hooks live under "hooks" in a settings file or in a plugin\'s hooks/hooks.json.',
    learnKind: 'hook',
  },
  {
    id: 'mcp',
    title: 'MCP servers',
    body: 'MCP servers give Claude external tools. They can be yours (user scope), shared with a team (.mcp.json, which needs a one-time approval), private to one project (local scope), bundled in a plugin, or connected in your claude.ai account. Their tools show up under the mcp__<server>__ prefix on the right, which is how rules and matchers refer to them.',
    pick: (i) => ofKind(i, 'mcpServer', 'connector', 'cloudConnectors', 'unknownMcpServer'),
    empty: 'No MCP servers are configured. Add one with `claude mcp add` or connect one in claude.ai.',
    learnKind: 'mcpServer',
  },
  {
    id: 'plugins',
    title: 'Plugins and marketplaces',
    body: 'A plugin bundles skills, agents, hooks and MCP servers and is installed from a marketplace. It only loads when a settings file lists it under enabledPlugins (green "enables" line). Big plugins are collapsed into one card with counts; double-click to open them. Every skill and agent description inside sits in context on every turn.',
    pick: (i) => ofKind(i, 'plugin', 'marketplace', 'pluginRegistry'),
    empty: 'No plugins are installed. Browse them with /plugin inside Claude Code.',
    learnKind: 'plugin',
  },
  {
    id: 'skills',
    title: 'Skills and agents',
    body: 'Skills are SKILL.md files you (or Claude) invoke by name, such as /review or /ecc:tdd-workflow; agents are specialists Claude delegates to in their own context. They can be personal, per project, synced from claude.ai, or provided by a plugin.',
    pick: (i) => ofKind(i, 'skill', 'agent', 'command', 'syncedBucket'),
    empty: 'No skills or agents yet. A personal skill is just ~/.claude/skills/<name>/SKILL.md.',
    learnKind: 'skill',
  },
  {
    id: 'memory',
    title: 'Memory and sessions',
    body: 'Claude keeps per-project notes for itself in MEMORY.md (loaded every session there) and topic files (read on demand). Conversation transcripts live beside them and power --resume. These layers are off by default; the tour switches them on so you can see where your data lives.',
    pick: (i) => ofKind(i, 'memoryIndex', 'memoryFile', 'session', 'liveSession'),
    layers: ['memory', 'sessions'],
    empty: 'No memory or sessions were found yet; they appear after Claude has run in a project.',
    learnKind: 'memoryIndex',
  },
]
