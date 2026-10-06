# claude-mri

See how your [Claude Code](https://code.claude.com/docs/en/overview) setup fits together.

`claude-mri` scans a machine for everything Claude Code reads (CLAUDE.md files and their `@imports`, settings and
permission rules, hooks, MCP servers in every scope, plugins and marketplaces, skills, agents, auto-memory, sessions)
and renders it as an interactive, Miro-style graph with plain-English explanations and a guided tour. It is meant as
a visual aid for people who are new to Claude Code and want to understand what loads when, what overrides what, and
which plugin provides which skill or hook.

```sh
npx claude-mri
```

That starts a small local server on `127.0.0.1`, scans the current user's configuration, and opens the graph in your
browser. Nothing is uploaded anywhere.

## What you get

- **Lanes by owner.** Organization → You (`~/.claude`) → Projects → Extensions → Tools and events. Lines flow
  rightwards, so following an arrow answers "what does this control?".
- **Precedence made visible.** Settings files stack with "overrides" edges; the inspector shows the effective
  permissions, model and env for every project with the file each value came from.
- **Big plugins stay readable.** A plugin with hundreds of skills is one card with counts until you double-click it;
  then it opens into sections you can filter.
- **Why is this here?** Every node explains itself: where it lives, when it loads, how to invoke it, and a link to the
  official docs.
- **Layers.** Configuration is the default lens; memory, sessions, plans and runtime state can be switched on.
- **Guided tour.** Eight stops that walk a newcomer through instructions, settings, hooks, MCP, plugins, skills and
  memory, degrading gracefully when a stop is empty on your machine.
- **Share safely.** Export a snapshot with home paths, emails and secret-looking values removed, or an anonymized one
  with project names hashed and personal notes dropped. Anyone can open it by dropping the file onto the app.

## Command line

```
claude-mri                      scan, serve, open the browser
claude-mri --json               print the snapshot as JSON and exit
claude-mri --export out.json    write a shareable (redacted) snapshot and exit
claude-mri --anonymize --export out.json
claude-mri --root ~/work        also search a folder for projects (repeatable)
claude-mri --config-dir <dir>   use a different Claude config directory
claude-mri --no-cli             skip "claude" CLI enrichment (plugin token costs)
claude-mri --no-open --port 5000
```

Run `claude-mri --help` for the full list.

## What is scanned, and what is never read

Files on disk are the source of truth. The `claude` CLI, when present, only adds plugin metadata and projected token
costs. `~/.claude.json` is read through an allowlist of keys (projects, MCP servers, connectors, usage counters); the
sign-in account section is never touched. `.credentials.json`, session lock keys and transcript bodies are never
opened. Values that look like secrets in environment maps, headers or command arguments are replaced with `«redacted»`
before they reach the snapshot, and the local server refuses to serve the state file, history or transcripts.

## Development

```sh
npm install
npm run dev        # server with tsc --watch + Vite dev server on :5173 (proxies /api to :4848)
npm test           # Vitest: scanner fixtures, API, UI
npm run build      # dist/server + dist/web
npm run smoke      # scan this machine with the built CLI and print counts
```

Requires Node 20.16 or newer. The server has no runtime dependencies; the UI is built with React, React Flow and ELK.

## Not affiliated with Anthropic

claude-mri is an independent community tool. It is not made or endorsed by Anthropic, and "Claude" is a trademark of
Anthropic, PBC.

MIT licensed.
