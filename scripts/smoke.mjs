// Scan the real machine with the built CLI and print counts (manual verification helper).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../dist/server/cli.js', import.meta.url))
const out = execFileSync(process.execPath, [cli, '--json', '--no-cli'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const snap = JSON.parse(out)
const byKind = {}
for (const n of snap.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1
console.log(`${snap.nodes.length} nodes, ${snap.edges.length} edges, ${snap.warnings.length} warnings, ${snap.meta.durationMs} ms`)
console.log(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '))
