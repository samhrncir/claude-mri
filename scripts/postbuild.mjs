// Make the CLI entry executable on POSIX so `npx claude-mri` works after `npm pack`.
import { chmod } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  const cli = fileURLToPath(new URL('../dist/server/cli.js', import.meta.url))
  await chmod(cli, 0o755)
}
