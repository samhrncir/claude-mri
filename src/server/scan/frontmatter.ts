// A deliberately small YAML subset for SKILL.md / agent / rules frontmatter:
// scalars, quoted strings, inline [a, b] lists, block "- item" lists, one level of nested maps, and > / | block scalars.

export interface Frontmatter {
  data: Record<string, unknown>
  body: string
  raw: string
  hasFrontmatter: boolean
  errors: string[]
}

const FENCE = /^---\s*$/
const KEY_LINE = /^([^:#][^:]*?):(?:\s+(.*))?$/

function stripComment(v: string): string {
  const i = v.search(/\s#/)
  return i >= 0 ? v.slice(0, i).trim() : v
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of s) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim() !== '') out.push(cur)
  return out
}

function parseScalar(raw: string): unknown {
  const v = raw.trim()
  if (v === '') return ''
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const inner = v.slice(1, -1)
    return v.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n') : inner.replace(/''/g, "'")
  }
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevelCommas(inner).map((x) => parseScalar(x))
  }
  return stripComment(v)
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

export function parseFrontmatter(text: string): Frontmatter {
  const src = text.replace(/^﻿/, '')
  const lines = src.split(/\r?\n/)
  if (lines.length === 0 || !FENCE.test(lines[0] ?? '')) {
    return { data: {}, body: src, raw: '', hasFrontmatter: false, errors: [] }
  }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (FENCE.test(lines[i] ?? '')) {
      end = i
      break
    }
  }
  if (end === -1) return { data: {}, body: src, raw: '', hasFrontmatter: false, errors: ['unterminated frontmatter'] }

  const fm = lines.slice(1, end)
  const body = lines.slice(end + 1).join('\n')
  const data: Record<string, unknown> = {}
  const errors: string[] = []

  let i = 0
  while (i < fm.length) {
    const line = fm[i] ?? ''
    i += 1
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (indentOf(line) !== 0) {
      errors.push(`unexpected indentation at line ${i}`)
      continue
    }
    const m = line.match(KEY_LINE)
    if (!m) {
      errors.push(`unparseable line ${i}: ${line.trim()}`)
      continue
    }
    const key = (m[1] ?? '').trim()
    const rest = (m[2] ?? '').trim()

    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const block: string[] = []
      while (i < fm.length && (indentOf(fm[i] ?? '') > 0 || (fm[i] ?? '').trim() === '')) {
        block.push((fm[i] ?? '').trim())
        i += 1
      }
      data[key] = rest.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim()
      continue
    }

    if (rest !== '') {
      data[key] = parseScalar(rest)
      continue
    }

    // Nested block: list or map, determined by the first indented line.
    const nested: string[] = []
    while (i < fm.length && (indentOf(fm[i] ?? '') > 0 || (fm[i] ?? '').trim() === '')) {
      if ((fm[i] ?? '').trim() !== '') nested.push(fm[i] ?? '')
      i += 1
    }
    if (nested.length === 0) {
      data[key] = ''
      continue
    }
    if ((nested[0] ?? '').trim().startsWith('- ')) {
      data[key] = nested.filter((l) => l.trim().startsWith('- ')).map((l) => parseScalar(l.trim().slice(2)))
      continue
    }
    const map: Record<string, unknown> = {}
    for (const l of nested) {
      const mm = l.trim().match(KEY_LINE)
      if (!mm) {
        errors.push(`unparseable nested line: ${l.trim()}`)
        continue
      }
      map[(mm[1] ?? '').trim()] = mm[2] === undefined ? '' : parseScalar(mm[2])
    }
    data[key] = map
  }

  return { data, body, raw: fm.join('\n'), hasFrontmatter: true, errors }
}

/** Normalizes `tools: Read, Write` or `[Read, Write]` or a YAML list into a string array. */
export function asStringList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter((v) => v !== '')
  if (typeof value === 'string') return value.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v !== '')
  return [String(value)]
}

export function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : String(value)
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export function countLines(text: string): number {
  return text === '' ? 0 : text.split(/\r?\n/).length
}

export function firstSentence(text: string | undefined, max = 140): string | undefined {
  if (!text) return undefined
  const one = text.replace(/\s+/g, ' ').trim()
  const cut = one.search(/[.!?](\s|$)/)
  const s = cut > 0 ? one.slice(0, cut + 1) : one
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
