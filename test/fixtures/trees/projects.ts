// Projects fixture: registry key with backslashes, home-as-project, ghost project, nested project, worktree,
// import chain with a missing target and a cycle, lazy rules, .mcp.json approvals, launch.json, managed + desktop configs.
import { encodeProjectDir } from '../../../src/server/scan/paths.js'
import type { FixtureTree } from '../../helpers/fixture.js'

export function projectsTree(home: string): FixtureTree {
  const app = `${home}/dev/app`
  const orphan = `${home}/dev/orphan`
  const appBackslashes = app.replaceAll('/', '\\')
  const transcript = [
    JSON.stringify({ type: 'mode', mode: 'default' }),
    JSON.stringify({ type: 'permission-mode', value: 'default' }),
    JSON.stringify({ type: 'system', cwd: orphan, sessionId: 'sess-orphan', version: '2.1.0', gitBranch: 'main', timestamp: '2026-10-01T00:00:00.000Z' }),
  ].join('\n')
  return {
    'home/.claude/settings.json': { model: 'opus', permissions: { allow: ['Read'] } },
    'home/.claude/CLAUDE.md': '# user\n',
    'home/CLAUDE.md': '# home-level parent instructions\n',
    'home/.claude.json': {
      projects: {
        [appBackslashes]: {
          allowedTools: ['Bash(npm test)'],
          mcpServers: { localdb: { command: 'db-mcp', args: ['--password', 'pw'] } },
          enabledMcpjsonServers: ['shared'],
          disabledMcpjsonServers: ['blocked'],
          hasTrustDialogAccepted: true,
          lastCost: 1.25,
          lastSessionId: 's1',
        },
        [`${home}/dev/gone`]: { allowedTools: [] },
        [home]: { allowedTools: [] },
      },
    },
    'home/dev/app/CLAUDE.md': '@AGENTS.md\n',
    'home/dev/app/AGENTS.md': '# Agents\n\nSee @docs/missing.md and @docs/loop-a.md for details. Email @someone about @types/node.\n',
    'home/dev/app/docs/loop-a.md': 'A imports @loop-b.md\n',
    'home/dev/app/docs/loop-b.md': 'B imports @loop-a.md\n',
    'home/dev/app/CLAUDE.local.md': 'private notes\n',
    'home/dev/app/.claude/settings.json': { permissions: { allow: ['Bash(npm run *)'], deny: ['Read(./.env)'] } },
    'home/dev/app/.claude/settings.local.json': { model: 'haiku', permissions: { allow: ['Bash(git *)'] } },
    'home/dev/app/.claude/rules/api.md': '---\npaths:\n  - "src/api/**"\n---\n# API rules\n',
    'home/dev/app/.claude/rules/general.md': '# General\n',
    'home/dev/app/.claude/agents/tester.md': '---\nname: tester\ndescription: Runs tests.\n---\nRun them.\n',
    'home/dev/app/.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Deploys.\n---\n',
    'home/dev/app/.claude/commands/ops/restart.md': 'Restart the service.\n',
    'home/dev/app/.mcp.json': { mcpServers: { shared: { type: 'http', url: 'https://mcp.example.com/sse' }, blocked: { command: 'x' }, pending: { command: 'y' } } },
    'home/dev/app/.claude/launch.json': { version: '0.1', configurations: [{ name: 'web', type: 'node', port: 3000 }] },
    'home/dev/app/.claude/worktrees/feature-x/.git': `gitdir: ${app}/.git/worktrees/feature-x\n`,
    'home/dev/app/.claude/worktrees/feature-x/CLAUDE.md': '# worktree\n',
    'home/dev/app/.claude/worktrees/feature-x/.claude/settings.local.json': { permissions: { allow: ['Bash(git *)'] } },
    'home/dev/app/.git/config': '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/sam/app.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
    'home/dev/app/packages/api/CLAUDE.md': '# api nested\n',
    'home/dev/app/node_modules/x/CLAUDE.md': 'should be skipped\n',
    'home/dev/other/.claude/settings.local.json': { permissions: { allow: ['Read'] } },
    'home/dev/orphan/CLAUDE.md': '# orphan\n',
    'home/.claude/history.jsonl': `${JSON.stringify({ display: 'x', project: `${home}/dev/other`, timestamp: 1759000000000, sessionId: 's2' })}\n`,
    [`home/.claude/projects/${encodeProjectDir(app)}/memory/MEMORY.md`]: '# Memory\n',
    [`home/.claude/projects/${encodeProjectDir(orphan)}/sess-orphan.jsonl`]: `${transcript}\n`,
    'root/scanned/proj1/CLAUDE.md': '# root-discovered\n',
    'root/scanned/proj1/node_modules/deep/CLAUDE.md': 'skip me\n',
    'root/scanned/plain/README.md': 'not a project\n',
    'appdata/Claude/claude_desktop_config.json': { mcpServers: { desktopOnly: { command: 'd' } } },
    'pf/ClaudeCode/managed-settings.json': { permissions: { deny: ['WebFetch'] }, model: 'sonnet' },
    'pf/ClaudeCode/managed-settings.d/extra.json': { env: { FOO: 'bar' } },
    'pf/ClaudeCode/CLAUDE.md': '# org rules\n',
  }
}
