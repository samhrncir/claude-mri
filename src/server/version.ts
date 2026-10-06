import { createRequire } from 'node:module'

/** Reads this package's version from package.json (two levels above dist/server or src/server). */
export function readOwnVersion(): string {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../../package.json') as { version?: string }
    return pkg.version ?? '0.0.0-dev'
  } catch {
    return '0.0.0-dev'
  }
}
