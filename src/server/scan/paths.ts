// Pure path helpers. The scanner works in forward-slash form everywhere; Node accepts that on Windows too.
import type { Platform } from '../../shared/kinds.js'

/** Strips Windows long-path and UNC-device prefixes: \\?\C:\x -> C:\x, //?/C:/x -> C:/x, \\?\UNC\srv\share -> //srv/share. */
export function stripUncPrefix(p: string): string {
  return p.replace(/^(?:\\\\\?\\|\/\/\?\/)(?:UNC[\\/])?/i, (m) => (m.toUpperCase().includes('UNC') ? '//' : ''))
}

/** Forward slashes, collapsed separators, resolved . and .., no trailing slash, upper-case drive letter on win32. */
export function normalizePath(p: string, platform: Platform): string {
  let s = stripUncPrefix(p).replaceAll('\\', '/')
  const unc = s.startsWith('//')
  s = s.replace(/\/{2,}/g, '/')
  if (unc) s = `/${s}`
  const parts = s.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0 && out[out.length - 1] !== '')) continue
    if (part === '..') {
      const last = out[out.length - 1] ?? ''
      if (out.length > 1 || (out.length === 1 && last !== '' && !/^[A-Za-z]:$/.test(last))) out.pop()
      continue
    }
    out.push(part)
  }
  s = out.join('/')
  if (s.length > 1 && s.endsWith('/') && !/^[A-Za-z]:\/$/.test(s)) s = s.slice(0, -1)
  if (platform === 'win32') s = s.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`)
  if (/^[A-Za-z]:$/.test(s)) s += '/'
  return s
}

/** Comparison key: normalized, and case-folded on win32 (case-insensitive file system). */
export function pathKey(p: string, platform: Platform): string {
  const n = normalizePath(p, platform)
  return platform === 'win32' ? n.toLowerCase() : n
}

export function joinPath(...parts: string[]): string {
  const joined = parts
    .filter((x) => x !== '')
    .map((x, i) => (i === 0 ? x.replace(/\/+$/, '') : x.replace(/^\/+|\/+$/g, '')))
    .join('/')
  return joined === '' ? '/' : joined
}

export function dirnameOf(p: string): string {
  const i = p.lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  const head = p.slice(0, i)
  return /^[A-Za-z]:$/.test(head) ? `${head}/` : head
}

export function basenameOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

export function isAbsolutePath(p: string, platform: Platform): boolean {
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('//')
  return p.startsWith('/')
}

/** True when `child` is `parent` or inside it (compared with pathKey). */
export function isUnder(child: string, parent: string, platform: Platform): boolean {
  const c = pathKey(child, platform)
  const p = pathKey(parent, platform)
  if (c === p) return true
  const prefix = p.endsWith('/') ? p : `${p}/`
  return c.startsWith(prefix)
}

/** Relative path from `base` to `target`, or null when target is outside base. */
export function relativeTo(base: string, target: string, platform: Platform): string | null {
  if (!isUnder(target, base, platform)) return null
  const n = normalizePath(target, platform)
  const b = normalizePath(base, platform)
  if (pathKey(n, platform) === pathKey(b, platform)) return ''
  return n.slice(b.endsWith('/') ? b.length : b.length + 1)
}

export function expandHome(p: string, home: string): string {
  if (p === '~') return home
  if (p.startsWith('~/')) return joinPath(home, p.slice(2))
  return p
}

export interface ScopeCtx {
  home: string
  configDir: string
  platform: Platform
}

/** `~/.claude/...`, `$cfg/...` (config dir outside home), `~/...`, or the normalized absolute path. */
export function scopePath(abs: string, ctx: ScopeCtx): string {
  const n = normalizePath(abs, ctx.platform)
  const underConfig = isUnder(n, ctx.configDir, ctx.platform)
  if (underConfig && !isUnder(ctx.configDir, ctx.home, ctx.platform)) {
    const rel = relativeTo(ctx.configDir, n, ctx.platform) ?? ''
    return rel === '' ? '$cfg' : `$cfg/${rel}`
  }
  if (isUnder(n, ctx.home, ctx.platform)) {
    const rel = relativeTo(ctx.home, n, ctx.platform) ?? ''
    return rel === '' ? '~' : `~/${rel}`
  }
  return n
}

/** The path portion used inside node ids: scoped, and case-folded on win32. */
export function idPathOf(abs: string, ctx: ScopeCtx): string {
  const s = scopePath(abs, ctx)
  return ctx.platform === 'win32' ? s.toLowerCase() : s
}

/** Claude Code's encoding for ~/.claude/projects/<dir>: every non-alphanumeric character becomes '-'. */
export function encodeProjectDir(projectPath: string): string {
  return projectPath.replace(/[^A-Za-z0-9]/g, '-')
}
