// Everything the scanner needs to know about the machine, passed in so tests can substitute a synthetic tree.
import { homedir } from 'node:os'
import type { Platform } from '../../shared/kinds.js'
import { joinPath, normalizePath } from './paths.js'

export interface ScanEnv {
  platform: Platform
  homedir: string
  env: Record<string, string | undefined>
  /** Re-roots absolute system paths (managed settings dirs) under this directory; used by tests. */
  fsRoot?: string
  roots: string[]
  configDirOverride?: string
}

export interface ResolvedPaths {
  home: string
  configDir: string
  configDirOverridden: boolean
  claudeJsonPath: string
  managedDirs: string[]
  desktopConfigPath: string
  /** True on win32 when the HKLM policy key should be queried. */
  queryRegistry: boolean
}

export function envFromProcess(opts: { configDir?: string; roots: string[] }): ScanEnv {
  const platform: Platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
  return {
    platform,
    homedir: homedir(),
    env: { ...process.env },
    roots: opts.roots,
    configDirOverride: opts.configDir,
  }
}

/** Maps an absolute system path into the fixture root (drive letter becomes a top-level folder). */
function rerootSystemPath(abs: string, env: ScanEnv): string {
  if (!env.fsRoot) return abs
  const normalized = normalizePath(abs, env.platform)
  const withoutDrive = normalized.replace(/^([A-Za-z]):\//, '$1/')
  return joinPath(normalizePath(env.fsRoot, env.platform), withoutDrive.replace(/^\//, ''))
}

export function resolvePaths(env: ScanEnv): ResolvedPaths {
  const home = normalizePath(env.homedir, env.platform)
  const override = env.configDirOverride ?? env.env.CLAUDE_CONFIG_DIR
  const configDirOverridden = Boolean(override && override.trim() !== '')
  const configDir = configDirOverridden ? normalizePath(override as string, env.platform) : joinPath(home, '.claude')
  // Claude Code keeps .claude.json next to the config dir when CLAUDE_CONFIG_DIR is set, else in the home dir.
  const claudeJsonPath = configDirOverridden ? joinPath(configDir, '.claude.json') : joinPath(home, '.claude.json')

  let managedDirs: string[]
  let desktopConfigPath: string
  switch (env.platform) {
    case 'win32': {
      // An explicit ProgramFiles (always set on real Windows, and by tests) is used as-is; only the fallback is re-rooted.
      const programFiles = env.env.ProgramFiles ?? env.env.PROGRAMFILES
      managedDirs = [programFiles ? joinPath(normalizePath(programFiles, 'win32'), 'ClaudeCode') : rerootSystemPath('C:/Program Files/ClaudeCode', env)]
      const appData = env.env.APPDATA ?? joinPath(home, 'AppData/Roaming')
      desktopConfigPath = joinPath(normalizePath(appData, 'win32'), 'Claude/claude_desktop_config.json')
      break
    }
    case 'darwin': {
      managedDirs = [rerootSystemPath('/Library/Application Support/ClaudeCode', env)]
      desktopConfigPath = joinPath(home, 'Library/Application Support/Claude/claude_desktop_config.json')
      break
    }
    default: {
      managedDirs = [rerootSystemPath('/etc/claude-code', env)]
      const xdg = env.env.XDG_CONFIG_HOME ?? joinPath(home, '.config')
      desktopConfigPath = joinPath(normalizePath(xdg, 'linux'), 'Claude/claude_desktop_config.json')
    }
  }

  return {
    home,
    configDir,
    configDirOverridden,
    claudeJsonPath,
    managedDirs,
    desktopConfigPath,
    queryRegistry: env.platform === 'win32' && !env.fsRoot,
  }
}
