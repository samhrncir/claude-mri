// Generates src/web/demo/demo-snapshot.json by scanning a small synthetic machine with the built scanner.
// Run after `tsc -p tsconfig.server.json`. The demo stays schema-valid because it comes from the real scanner.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = new URL('../dist/server/', import.meta.url)
const { scan } = await import(new URL('scan/index.js', dist))
const { buildExport } = await import(new URL('export.js', dist))

const dir = (await mkdtemp(join(tmpdir(), 'claude-mri-demo-'))).replaceAll('\\', '/')
const home = `${dir}/home`
const app = `${home}/projects/my-app`

const tree = {
  'home/.claude/settings.json': {
    model: 'sonnet',
    enabledPlugins: { 'code-review@anthropic-marketplace': true },
    permissions: { allow: ['Read', 'Bash(git status)', 'Bash(npm test)'], deny: ['Bash(rm -rf *)'] },
    hooks: { PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write "$FILE"', timeout: 20 }] }] },
  },
  'home/.claude/CLAUDE.md': '# My preferences\n\n- Prefer TypeScript.\n- Keep commits small.\n',
  'home/.claude.json': {
    projects: { [app]: { allowedTools: [], mcpServers: { 'local-db': { command: 'npx', args: ['-y', 'db-mcp'] } }, enabledMcpjsonServers: ['github'], hasTrustDialogAccepted: true, lastCost: 0.42, lastSessionId: 'aaaa0001' } },
    mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', home] } },
    claudeAiMcpEverConnected: ['claude.ai Google Calendar'],
    pluginUsage: { 'code-review@anthropic-marketplace': { usageCount: 12, lastUsedAt: '2026-10-01T09:00:00.000Z' } },
  },
  'home/.claude/skills/summarize/SKILL.md': '---\nname: summarize\ndescription: Summarize the current changes for a PR description.\n---\nRead the diff and write a summary.\n',
  'home/.claude/plugins/installed_plugins.json': { version: 2, plugins: { 'code-review@anthropic-marketplace': [{ scope: 'user', installPath: `${home}/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0`, version: '1.2.0', installedAt: '2026-09-15T00:00:00Z', lastUpdated: '2026-09-15T00:00:00Z' }] } },
  'home/.claude/plugins/known_marketplaces.json': { 'anthropic-marketplace': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, installLocation: `${home}/.claude/plugins/marketplaces/anthropic-marketplace` } },
  'home/.claude/plugins/marketplaces/anthropic-marketplace/.claude-plugin/marketplace.json': { name: 'anthropic-marketplace', plugins: [{ name: 'code-review', version: '1.2.0' }, { name: 'deploy-tools', version: '0.3.0' }] },
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/.claude-plugin/plugin.json': { name: 'code-review', version: '1.2.0', description: 'Review helpers', author: { name: 'Example Author' } },
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/skills/review-pr/SKILL.md': '---\nname: review-pr\ndescription: Review a pull request for bugs and style.\n---\n',
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/skills/security-scan/SKILL.md': '---\nname: security-scan\ndescription: Look for common security issues.\n---\n',
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/skills/explain-diff/SKILL.md': '---\nname: explain-diff\ndescription: Explain a diff in plain English.\n---\n',
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/agents/reviewer.md': '---\nname: reviewer\ndescription: A careful code reviewer.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\nReview carefully.\n',
  'home/.claude/plugins/cache/anthropic-marketplace/code-review/1.2.0/hooks/hooks.json': { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node scripts/guard.js' }] }] } },
  'home/projects/my-app/CLAUDE.md': '@AGENTS.md\n',
  'home/projects/my-app/AGENTS.md': '# My App\n\nRun `npm test` before committing. Architecture notes live in @docs/architecture.md.\n',
  'home/projects/my-app/docs/architecture.md': '# Architecture\n\nA small Express API with a React front end.\n',
  'home/projects/my-app/.claude/settings.json': { permissions: { allow: ['Bash(npm run *)'] } },
  'home/projects/my-app/.claude/settings.local.json': { permissions: { allow: ['Bash(git push *)'] }, model: 'opus' },
  'home/projects/my-app/.claude/agents/tester.md': '---\nname: tester\ndescription: Writes and runs tests.\n---\n',
  'home/projects/my-app/.mcp.json': { mcpServers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } } },
  'home/projects/my-app/src/api/CLAUDE.md': '# API conventions\n\nValidate every input.\n',
  [`home/.claude/projects/${app.replace(/[^A-Za-z0-9]/g, '-')}/memory/MEMORY.md`]: '# Memory\n\n- [Deploy steps](deploy.md) — how we ship\n',
  [`home/.claude/projects/${app.replace(/[^A-Za-z0-9]/g, '-')}/memory/deploy.md`]: '---\nname: deploy\ndescription: Deploy steps\nmetadata:\n  type: project\n---\nRun the release script.\n',
  [`home/.claude/projects/${app.replace(/[^A-Za-z0-9]/g, '-')}/aaaa0001-0000-0000-0000-000000000001.jsonl`]: `${JSON.stringify({ type: 'system', cwd: app, gitBranch: 'main', version: '2.1.0', timestamp: '2026-10-01T09:00:00.000Z' })}\n`,
  [`home/.claude/projects/${app.replace(/[^A-Za-z0-9]/g, '-')}/bbbb0002-0000-0000-0000-000000000002.jsonl`]: `${JSON.stringify({ type: 'system', cwd: app, gitBranch: 'feature/login', version: '2.1.0', timestamp: '2026-10-03T14:00:00.000Z' })}\n`,
  'home/.claude/plans/add-login-page.md': '# Add login page\n\n1. Form\n2. Session\n',
  'home/.claude/.credentials.json': { claudeAiOauth: { accessToken: 'demo' } },
}

for (const [rel, value] of Object.entries(tree)) {
  const abs = join(dir, rel)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8')
}

const env = { platform: 'linux', homedir: home, env: { HOME: home, XDG_CONFIG_HOME: `${dir}/xdg` }, fsRoot: `${dir}/sys`, roots: [] }
const snapshot = await scan(env, { depth: 3, deepSessions: false, cli: false, probeMcp: false, toolVersion: 'demo' })
const shared = buildExport(snapshot, { anonymize: false, username: 'demo-user', hostname: 'demo-host' })
shared.meta.scannedAt = '2026-10-05T12:00:00.000Z'
shared.meta.snapshotId = 'demo-snapshot'
shared.meta.durationMs = 42

const out = fileURLToPath(new URL('../src/web/demo/demo-snapshot.json', import.meta.url))
await mkdir(fileURLToPath(new URL('../src/web/demo/', import.meta.url)), { recursive: true })
await writeFile(out, `${JSON.stringify(shared, null, 1)}\n`, 'utf8')
await rm(dir, { recursive: true, force: true })
console.log(`wrote ${shared.nodes.length} nodes, ${shared.edges.length} edges to ${out}`)
