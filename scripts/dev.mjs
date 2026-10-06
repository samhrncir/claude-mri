// Development runner: compile the server in watch mode, run it with --watch, and start Vite.
// Zero dependencies (no concurrently); Ctrl+C stops all three.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const children = []

function run(label, cmd, args) {
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[dev] ${label} exited with code ${code}`)
  })
  children.push(child)
  return child
}

run('tsc', npx, ['tsc', '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput'])

// Wait for the first server build before starting it.
const cliPath = `${root}dist/server/cli.js`
const started = Date.now()
const timer = setInterval(() => {
  if (existsSync(cliPath) || Date.now() - started > 60_000) {
    clearInterval(timer)
    run('server', process.execPath, ['--watch', cliPath, '--no-open', '--port', '4848', '--verbose'])
    run('vite', npx, ['vite'])
  }
}, 300)

function shutdown() {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
