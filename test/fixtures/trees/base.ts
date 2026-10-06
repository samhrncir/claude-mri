// A small but complete user-scope setup: settings with rules and hooks, a plugin with every component type,
// a user-scope MCP server with a secret header, a claude.ai connector, personal and synced skills.
import type { FixtureTree } from '../../helpers/fixture.js'

export const GH_TOKEN = `ghp_${'a'.repeat(36)}`

export function baseUser(home: string): FixtureTree {
  const pluginRoot = `${home}/.claude/plugins/cache/local/demo/1.0.0`
  return {
    'home/.claude/settings.json': {
      model: 'sonnet',
      enabledPlugins: { 'demo@local': true, 'ghostly@local': true },
      pluginConfigs: { 'demo@local': { options: { verbosity: 'high', api_key: 'shh-secret' } } },
      extraKnownMarketplaces: { local: { source: { source: 'directory', path: `${home}/mkt` } } },
      permissions: { allow: ['Bash(git *)', 'Read', 'mcp__github__list_issues', 'Skill(my-skill)'], deny: ['Bash(rm -rf *)', 'mcp__nowhere__*'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash|Edit', hooks: [{ type: 'command', command: 'node hooks/check.js --token abc', timeout: 10 }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }],
      },
    },
    'home/.claude/CLAUDE.md': '# Preferences\n\nUse npm. See @docs/style.md for formatting.\n',
    'home/.claude/docs/style.md': '# Style\n\nTwo spaces.\n',
    'home/.claude.json': {
      numStartups: 42,
      installMethod: 'global',
      oauthAccount: { emailAddress: 'secret@example.com', accountUuid: 'acct-1' },
      userID: 'u'.repeat(64),
      projects: {
        [`${home}/dev/app`]: { allowedTools: [], mcpServers: {}, hasTrustDialogAccepted: true, lastSessionId: 'sess-1', lastCost: 0.5 },
      },
      mcpServers: {
        github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: `Bearer ${GH_TOKEN}` } },
      },
      claudeAiMcpEverConnected: ['claude.ai Google Calendar'],
      pluginUsage: { 'demo@local': { usageCount: 3, lastUsedAt: '2026-10-01T00:00:00.000Z' } },
      skillUsage: { alpha: { usageCount: 2, lastUsedAt: '2026-10-02T00:00:00.000Z' } },
    },
    'home/.claude/skills/my-skill/SKILL.md': '---\nname: my-skill\ndescription: A personal skill.\ndisable-model-invocation: true\n---\nDo the thing.\n',
    'home/.claude/skills/synced/org1_acct1/manifest.json': { lastUpdated: '2026-10-01T00:00:00Z', skills: [{ name: 'pdf' }] },
    'home/.claude/skills/synced/org1_acct1/pdf/SKILL.md': '---\nname: pdf\ndescription: Work with PDFs.\n---\n',
    'home/.claude/plugins/installed_plugins.json': {
      version: 2,
      plugins: { 'demo@local': [{ scope: 'user', installPath: pluginRoot, version: '1.0.0', installedAt: '2026-09-01T00:00:00Z', lastUpdated: '2026-09-01T00:00:00Z' }] },
    },
    'home/.claude/plugins/known_marketplaces.json': {
      local: { source: { source: 'directory', path: `${home}/mkt` }, installLocation: `${home}/.claude/plugins/marketplaces/local`, lastUpdated: '2026-09-01T00:00:00Z' },
    },
    'home/.claude/plugins/marketplaces/local/.claude-plugin/marketplace.json': { name: 'local', plugins: [{ name: 'demo', version: '1.0.0' }, { name: 'other', version: '2.0.0' }] },
    [`home/.claude/plugins/cache/local/demo/1.0.0/.claude-plugin/plugin.json`]: { name: 'demo', version: '1.0.0', description: 'Demo plugin', author: { name: 'Someone' }, mcpServers: {}, userConfig: { verbosity: { type: 'string' } } },
    'home/.claude/plugins/cache/local/demo/1.0.0/skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Alpha skill.\n---\n',
    'home/.claude/plugins/cache/local/demo/1.0.0/skills/beta/SKILL.md': '---\nname: beta\ndescription: Beta skill.\n---\n',
    'home/.claude/plugins/cache/local/demo/1.0.0/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews code.\ntools: Read, Grep\nmodel: sonnet\n---\nReview.\n',
    'home/.claude/plugins/cache/local/demo/1.0.0/commands/aside.md': '---\ndescription: Quick aside.\n---\nAnswer briefly.\n',
    'home/.claude/plugins/cache/local/demo/1.0.0/hooks/hooks.json': {
      hooks: {
        PreToolUse: [{ matcher: '^mcp__', hooks: [{ type: 'command', command: 'node scripts/hooks/guard.js' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'node scripts/hooks/log.js', async: true }] }],
      },
    },
    'home/.claude/plugins/cache/local/demo/1.0.0/.mcp.json': { mcpServers: { devtools: { command: 'npx', args: ['-y', 'devtools-mcp', '--token', 'abc123'], env: { DEBUG: '1', API_KEY: '${MY_KEY}' } } } },
    'home/.claude/plugins/cache/local/demo/1.0.0/rules/typescript.md': '# TS rules\n',
    'home/.claude/plugins/cache/local/demo/0.9.0/.claude-plugin/plugin.json': { name: 'demo', version: '0.9.0' },
    'home/.claude/.credentials.json': { claudeAiOauth: { accessToken: 'sk-ant-oat01-' + 'x'.repeat(40) } },
    'home/.claude/history.jsonl': `${JSON.stringify({ display: 'hello', project: `${home}/dev/app`, timestamp: 1759000000000, sessionId: 'sess-1' })}\n`,
    'home/.claude/state/skill-runs.jsonl': '{}\n',
    'home/.claude/bash-commands.log': 'git status\n',
  }
}
