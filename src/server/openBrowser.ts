// Fire-and-forget launchers for the default browser and the OS file manager. Never throw; the URL is always printed too.
import { spawn } from 'node:child_process'
import type { Platform } from '../shared/kinds.js'

function detached(cmd: string, args: string[]): void {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => undefined)
    child.unref()
  } catch {
    // ignore: the caller prints the URL/path as a fallback
  }
}

export function openUrl(url: string, platform: Platform = process.platform as Platform): void {
  if (platform === 'win32') detached('cmd', ['/d', '/s', '/c', 'start', '', url])
  else if (platform === 'darwin') detached('open', [url])
  else detached('xdg-open', [url])
}

/** Reveals a folder (or a file's folder) in the system file manager. */
export function openPath(dir: string, platform: Platform = process.platform as Platform): void {
  if (platform === 'win32') detached('explorer', [dir.replaceAll('/', '\\')])
  else if (platform === 'darwin') detached('open', [dir])
  else detached('xdg-open', [dir])
}
