// Pure CLI argument parsing (kept separate from cli.ts so it can be unit-tested).
import { parseArgs } from 'node:util'

export interface CliOptions {
  port?: number
  open: boolean
  roots: string[]
  configDir?: string
  depth: number
  export?: string
  anonymize: boolean
  json: boolean
  redact: boolean
  probeMcp: boolean
  cli: boolean
  watch: boolean
  deepSessions: boolean
  verbose: boolean
  help: boolean
  version: boolean
}

export class CliUsageError extends Error {}

export const HELP = `claude-mri: explore your Claude Code configuration as an interactive graph

Usage: claude-mri [options]

  (no options)          scan this machine, start a local server, open the browser
  --json                print the snapshot as JSON to stdout and exit
  --export <file>       write a redacted, shareable snapshot and exit
  --anonymize           with --export/--json: also hash project names and drop file contents
  --redact              with --json: apply export-level redaction (tilde paths, no emails)

  --root <dir>          also scan this folder for projects (repeatable)
  --config-dir <dir>    Claude config directory (default: $CLAUDE_CONFIG_DIR or ~/.claude)
  --depth <n>           folder depth to search under each --root (default 3)
  --deep-sessions       count lines in session transcripts (slower)
  --probe-mcp           run "claude mcp list" to health-check servers (slow)
  --no-cli              do not call the "claude" CLI for enrichment
  --no-watch            do not watch config files for changes

  --port <n>            server port (default 4848, falls back to the next free port)
  --no-open             do not open the browser
  --verbose             debug logging to stderr
  -h, --help            show this help
  -v, --version         print the version
`

function toInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new CliUsageError(`--${name} expects a non-negative integer, got "${raw}"`)
  return n
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  let values
  try {
    values = parseArgs({
      args: [...argv],
      strict: true,
      allowNegative: true,
      options: {
        port: { type: 'string' },
        open: { type: 'boolean', default: true },
        root: { type: 'string', multiple: true },
        'config-dir': { type: 'string' },
        depth: { type: 'string' },
        export: { type: 'string' },
        anonymize: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        redact: { type: 'boolean', default: false },
        'probe-mcp': { type: 'boolean', default: false },
        cli: { type: 'boolean', default: true },
        watch: { type: 'boolean', default: true },
        'deep-sessions': { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }).values
  } catch (err) {
    throw new CliUsageError(err instanceof Error ? err.message : String(err))
  }

  const port = values.port === undefined ? undefined : toInt('port', values.port, 0)
  if (port !== undefined && (port < 1 || port > 65535)) throw new CliUsageError(`--port must be between 1 and 65535`)

  return {
    port,
    open: values.open,
    roots: values.root ?? [],
    configDir: values['config-dir'],
    depth: toInt('depth', values.depth, 3),
    export: values.export,
    anonymize: values.anonymize,
    json: values.json,
    redact: values.redact,
    probeMcp: values['probe-mcp'],
    cli: values.cli,
    watch: values.watch,
    deepSessions: values['deep-sessions'],
    verbose: values.verbose,
    help: values.help,
    version: values.version,
  }
}
