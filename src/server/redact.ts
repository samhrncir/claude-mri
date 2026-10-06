// Redaction is applied inside the scanner (local level) and again for exports (tilde paths, emails, host/user).
import type { Platform } from '../shared/kinds.js'
import type { Snapshot } from '../shared/snapshot.js'

export const REDACTED = '«redacted»'
export const SECRET_KEY_RE =
  /(token|secret|passw(or)?d|pwd|authorization|cookie|credential|bearer|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|session[-_]?id|^key$)/i
export const PLACEHOLDER_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}/g
export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const TOKEN_SHAPES: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key)
}

/** `${VAR}` references are configuration, not secrets; keep them so the graph can show "needs VAR". */
export function isPlaceholder(value: string): boolean {
  return /^\s*\$\{[^}]+\}\s*$/.test(value)
}

export function placeholdersIn(value: string): string[] {
  return Array.from(value.matchAll(PLACEHOLDER_RE), (m) => m[0])
}

export function redactTokenShapes(text: string): string {
  let out = text
  for (const re of TOKEN_SHAPES) out = out.replace(re, REDACTED)
  return out
}

export interface RedactedMap {
  values: Record<string, string>
  redactedKeys: string[]
  placeholders: string[]
}

/** Redacts secret-looking keys in an env/header map; keys are kept so the graph still shows what is required. */
export function redactMap(input: unknown): RedactedMap {
  const values: Record<string, string> = {}
  const redactedKeys: string[] = []
  const placeholders: string[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { values, redactedKeys, placeholders }
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
    placeholders.push(...placeholdersIn(value))
    if (isSecretKey(key) && !isPlaceholder(value)) {
      values[key] = REDACTED
      redactedKeys.push(key)
    } else {
      values[key] = redactTokenShapes(value)
    }
  }
  return { values, redactedKeys, placeholders }
}

/** Redacts values following secret-looking flags (`--token abc`) and `key=value` pairs with secret-looking keys. */
export function redactArgs(args: readonly unknown[]): { args: string[]; redactedKeys: string[] } {
  const out: string[] = []
  const redactedKeys: string[] = []
  let redactNext: string | null = null
  for (const raw of args) {
    const arg = typeof raw === 'string' ? raw : JSON.stringify(raw)
    if (redactNext) {
      out.push(isPlaceholder(arg) ? arg : REDACTED)
      redactedKeys.push(redactNext)
      redactNext = null
      continue
    }
    const flag = arg.match(/^--?([A-Za-z][\w-]*)(?:=(.*))?$/)
    if (flag && isSecretKey(flag[1] ?? '')) {
      if (flag[2] !== undefined) {
        out.push(isPlaceholder(flag[2]) ? arg : `${arg.slice(0, arg.indexOf('=') + 1)}${REDACTED}`)
        redactedKeys.push(flag[1] ?? '')
      } else {
        out.push(arg)
        redactNext = flag[1] ?? ''
      }
      continue
    }
    const kv = arg.match(/^([A-Za-z_][\w-]*)=(.*)$/)
    if (kv && isSecretKey(kv[1] ?? '') && !isPlaceholder(kv[2] ?? '')) {
      out.push(`${kv[1]}=${REDACTED}`)
      redactedKeys.push(kv[1] ?? '')
      continue
    }
    out.push(redactTokenShapes(arg))
  }
  return { args: out, redactedKeys }
}

/** Strips userinfo and query-string values from a URL. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.username || u.password) {
      u.username = ''
      u.password = ''
    }
    for (const key of Array.from(u.searchParams.keys())) u.searchParams.set(key, REDACTED)
    return u.toString()
  } catch {
    return redactTokenShapes(url)
  }
}

/**
 * Deep walk: secret-looking keys get REDACTED values, `args` arrays lose flag values and key=value secrets,
 * `url` strings lose userinfo and query values, and every string loses well-known token shapes.
 */
export function redactSecretsDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactTokenShapes(value)
  if (Array.isArray(value)) return value.map(redactSecretsDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k) && typeof v === 'string' && !isPlaceholder(v)) out[k] = REDACTED
      else if (k === 'args' && Array.isArray(v)) out[k] = redactArgs(v).args
      else if (k === 'url' && typeof v === 'string') out[k] = redactUrl(v)
      else out[k] = redactSecretsDeep(v)
    }
    return out
  }
  return value
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replaces every spelling of the home dir (slashes, backslashes, doubled backslashes) with `~`. */
export function tildeify(text: string, home: string, platform: Platform): string {
  const fwd = home.replaceAll('\\', '/').replace(/\/+$/, '')
  const back = fwd.replaceAll('/', '\\')
  const dbl = fwd.replaceAll('/', '\\\\')
  const flags = platform === 'win32' ? 'gi' : 'g'
  let out = text
  for (const spelling of [dbl, back, fwd]) {
    if (spelling.length < 3) continue
    out = out.replace(new RegExp(escapeRe(spelling), flags), '~')
  }
  return out
}

export interface ExportRedactionOptions {
  home: string
  platform: Platform
  username?: string
  hostname?: string
}

/** Export-level redaction: tilde paths, emails, user and host names. Returns a new snapshot. */
export function redactForExport(snapshot: Snapshot, opts: ExportRedactionOptions): Snapshot {
  const userRe = opts.username && opts.username.length >= 3 ? new RegExp(`\\b${escapeRe(opts.username)}\\b`, 'g') : null
  const hostRe = opts.hostname && opts.hostname.length >= 3 ? new RegExp(`\\b${escapeRe(opts.hostname)}\\b`, 'gi') : null
  const scrub = (s: string): string => {
    let out = tildeify(s, opts.home, opts.platform)
    out = out.replace(EMAIL_RE, '«email»')
    if (userRe) out = out.replace(userRe, '«user»')
    if (hostRe) out = out.replace(hostRe, '«host»')
    return out
  }
  // Keys are scrubbed too: some maps (history counts, env) are keyed by paths.
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return scrub(value)
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[scrub(k)] = walk(v)
      return out
    }
    return value
  }
  const copy = walk(structuredClone(snapshot)) as Snapshot
  copy.meta.homeDir = '~'
  copy.meta.mode = 'shared'
  copy.meta.redaction = 'export'
  return copy
}
