// All diagnostics go to stderr so `--json` output on stdout stays clean.
let verbose = false

export function setVerbose(value: boolean): void {
  verbose = value
}

export const log = {
  info(...args: unknown[]): void {
    console.error('[claude-mri]', ...args)
  },
  warn(...args: unknown[]): void {
    console.error('[claude-mri] warning:', ...args)
  },
  debug(...args: unknown[]): void {
    if (verbose) console.error('[claude-mri] debug:', ...args)
  },
}
