#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { hostname, userInfo } from 'node:os'
import { CliUsageError, HELP, parseCliArgs, type CliOptions } from './cliArgs.js'
import { buildExport } from './export.js'
import { log, setVerbose } from './log.js'
import type { ScanOptions } from './scan/context.js'
import { envFromProcess } from './scan/env.js'
import { scan } from './scan/index.js'
import { startServer } from './server.js'
import { readOwnVersion } from './version.js'

function safeUsername(): string | undefined {
  try {
    return userInfo().username
  } catch {
    return undefined
  }
}

async function main(argv: string[]): Promise<number> {
  let opts: CliOptions
  try {
    opts = parseCliArgs(argv)
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(`claude-mri: ${err.message}\n`)
      console.error(HELP)
      return 1
    }
    throw err
  }
  if (opts.help) {
    console.log(HELP)
    return 0
  }
  const version = readOwnVersion()
  if (opts.version) {
    console.log(version)
    return 0
  }
  setVerbose(opts.verbose)
  const env = envFromProcess({ configDir: opts.configDir, roots: opts.roots })
  const scanOptions: ScanOptions = { depth: opts.depth, deepSessions: opts.deepSessions, cli: opts.cli, probeMcp: opts.probeMcp, toolVersion: version }

  if (opts.json || opts.export !== undefined) {
    const snapshot = await scan(env, scanOptions, (phase, done, total) => log.debug(`scan ${done}/${total}: ${phase}`))
    const shareable = opts.export !== undefined || opts.redact || opts.anonymize
    const out = shareable ? buildExport(snapshot, { anonymize: opts.anonymize, username: safeUsername(), hostname: hostname() }) : snapshot
    const json = JSON.stringify(out, null, 2)
    if (opts.export !== undefined) {
      await writeFile(opts.export, `${json}\n`, 'utf8')
      log.info(`wrote ${out.nodes.length} nodes and ${out.edges.length} edges to ${opts.export}`)
    }
    if (opts.json) process.stdout.write(`${json}\n`)
    return 0
  }

  const server = await startServer({ env, scanOptions, port: opts.port, open: opts.open, watch: opts.watch, toolVersion: version })
  console.log(`claude-mri ${version} is running at ${server.url}  (Ctrl+C to stop)`)
  await new Promise<void>((resolve) => {
    const stop = () => {
      log.info('shutting down')
      void server.close().then(resolve)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  return 0
}

process.exitCode = await main(process.argv.slice(2))
