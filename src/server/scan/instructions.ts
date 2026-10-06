// CLAUDE.md files, their @imports, and .claude/rules/*.md.
import { idOf } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { ClaudeMdRole, ImportRef } from '../../shared/nodeData.js'
import type { Node } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { INLINE_MD_MAX, MD_READ_MAX, addFile, excerptOf } from './files.js'
import { readTextCapped, sha1, statSafe, walkDirs } from './fsx.js'
import { asStringList, countLines, parseFrontmatter } from './frontmatter.js'
import { basenameOf, dirnameOf, expandHome, isAbsolutePath, isUnder, joinPath, normalizePath, pathKey } from './paths.js'

export interface RawImport {
  raw: string
  line: number
}

const IMPORT_RE = /(?:^|\s)@([^\s`'"<>()]+)/g
const MAX_IMPORT_DEPTH = 5

function hasExplicitPrefix(token: string): boolean {
  return token.startsWith('~/') || token.startsWith('./') || token.startsWith('../') || token.startsWith('/') || /^[A-Za-z]:[\\/]/.test(token)
}

function hasExtension(token: string): boolean {
  return /\.[A-Za-z0-9]{1,6}$/.test(token)
}

/** `@path` lines outside code fences and inline code spans. Scoped npm-style handles are filtered later. */
export function extractImports(text: string): RawImport[] {
  const out: RawImport[] = []
  let inFence = false
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const stripped = line.replace(/`[^`]*`/g, '')
    for (const m of stripped.matchAll(IMPORT_RE)) {
      const token = (m[1] ?? '').replace(/[.,;:]+$/, '')
      if (token === '') continue
      if (hasExplicitPrefix(token) || token.includes('/') || hasExtension(token)) out.push({ raw: token, line: i + 1 })
    }
  })
  return out
}

const ROLE_TEXT: Record<ClaudeMdRole, string> = {
  managed: 'Instructions enforced by your organization, loaded at the start of every session.',
  user: 'Your personal instructions, loaded at the start of every session in every project.',
  project: 'Project instructions shared with the team, loaded whenever Claude runs in this folder.',
  local: 'Your private project instructions (CLAUDE.local.md, git-ignored), loaded with the project.',
  parent: 'Instructions from a parent folder; Claude loads these too when it runs in a project below it.',
  nested: 'Instructions in a subfolder, loaded only when Claude reads files there.',
  worktree: 'Instructions inside a git worktree Claude created; they apply when working in that worktree.',
}

export interface ClaudeMdOptions {
  role: ClaudeMdRole
  parentId: string
  scope: Scope
  projectRoot?: string
}

function labelFor(abs: string, role: ClaudeMdRole): string {
  const base = basenameOf(abs)
  return role === 'user' || role === 'project' || role === 'local' || role === 'managed' ? `${base} (${role})` : base
}

/** Scans a CLAUDE.md variant. Returns the existing node when the same file was already scanned (shared parents). */
export async function scanClaudeMd(ctx: ScanContext, abs: string, o: ClaudeMdOptions): Promise<Node<'claudeMd'> | null> {
  const id = idOf('claudeMd', ctx.idPath(abs))
  const existing = ctx.b.get(id) as Node<'claudeMd'> | undefined
  if (existing) return existing
  const read = await readTextCapped(abs, MD_READ_MAX)
  if (!read) return null
  const entry = addFile(ctx, abs, {
    size: read.size,
    mtimeMs: read.mtimeMs,
    sha1: sha1(read.text),
    content: read.size <= INLINE_MD_MAX ? read.text : undefined,
    excerpt: read.size > INLINE_MD_MAX ? excerptOf(read.text) : undefined,
    truncated: read.truncated,
  })
  const rawImports = extractImports(read.text)
  const nonBlank = read.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const isImportOnly = rawImports.length > 0 && nonBlank.every((l) => /^@\S+$/.test(l))
  const lines = countLines(read.text)
  const node = ctx.b.node({
    id,
    kind: 'claudeMd',
    label: labelFor(abs, o.role),
    scope: o.scope,
    layer: 'config',
    parentId: o.parentId,
    path: abs,
    fileId: entry.id,
    summary: ROLE_TEXT[o.role],
    data: { role: o.role, lines, imports: [], isImportOnly },
    stats: { sizeBytes: read.size, lines },
  })
  node.data.imports = await resolveImports(ctx, node, abs, rawImports, o, 1, new Set([pathKey(abs, ctx.env.platform)]))
  if (isImportOnly) node.summary = `${ROLE_TEXT[o.role]} This file only imports ${rawImports.map((r) => `@${r.raw}`).join(', ')}.`
  else if (rawImports.length > 0) node.summary = `${ROLE_TEXT[o.role]} ${lines} lines; imports ${rawImports.length} file${rawImports.length === 1 ? '' : 's'}.`
  else node.summary = `${ROLE_TEXT[o.role]} ${lines} lines.`
  return node
}

function resolveImportPath(ctx: ScanContext, fromAbs: string, raw: string): string {
  const home = ctx.paths.home
  if (raw.startsWith('~')) return normalizePath(expandHome(raw, home), ctx.env.platform)
  if (isAbsolutePath(raw, ctx.env.platform)) return normalizePath(raw, ctx.env.platform)
  return normalizePath(joinPath(dirnameOf(fromAbs), raw), ctx.env.platform)
}

async function resolveImports(
  ctx: ScanContext,
  from: Node,
  fromAbs: string,
  raws: RawImport[],
  o: ClaudeMdOptions,
  depth: number,
  ancestors: Set<string>,
): Promise<ImportRef[]> {
  const refs: ImportRef[] = []
  for (const r of raws) {
    const target = resolveImportPath(ctx, fromAbs, r.raw)
    const key = pathKey(target, ctx.env.platform)
    const external = o.projectRoot ? !isUnder(target, o.projectRoot, ctx.env.platform) && !isUnder(target, ctx.paths.configDir, ctx.env.platform) : false
    const st = await statSafe(target)
    if (!st || !st.isFile()) {
      if (!hasExplicitPrefix(r.raw) && !hasExtension(r.raw)) continue // e.g. @types/node in prose
      const missingId = idOf('importedDoc', ctx.idPath(target))
      ctx.b.node({ id: missingId, kind: 'importedDoc', label: basenameOf(target), scope: o.scope, layer: 'config', parentId: o.parentId, path: target, summary: `Imported with @${r.raw} but the file does not exist, so nothing is loaded.`, data: { lines: 0, imports: [] }, flags: ['missing'] })
      ctx.b.edge({ kind: 'imports', source: from.id, target: missingId, label: `@${r.raw}`, data: { missing: true, depth } })
      ctx.b.warn({ code: 'import.missing', severity: 'warn', message: `${fromAbs} imports missing file @${r.raw}`, path: fromAbs, nodeId: from.id })
      refs.push({ raw: r.raw, line: r.line, resolved: target, missing: true, external })
      continue
    }
    refs.push({ raw: r.raw, line: r.line, resolved: target, missing: false, external })
    if (ancestors.has(key)) {
      const cycleTarget = ctx.b.all().find((n) => n.path && pathKey(n.path, ctx.env.platform) === key)
      if (cycleTarget) ctx.b.edge({ kind: 'imports', source: from.id, target: cycleTarget.id, label: `@${r.raw}`, data: { cycle: true, depth } })
      ctx.b.warn({ code: 'import.cycle', severity: 'warn', message: `${fromAbs} imports @${r.raw}, which already imports it`, path: fromAbs, nodeId: from.id })
      continue
    }
    let targetNode: Node | null
    if (basenameOf(target).toLowerCase() === 'claude.md') {
      targetNode = await scanClaudeMd(ctx, target, { ...o, parentId: o.parentId })
    } else {
      targetNode = await scanImportedDoc(ctx, target, o, depth, new Set([...ancestors, key]))
    }
    if (!targetNode) continue
    if (external) ctx.b.addFlag(targetNode.id, 'external')
    const depthExceeded = depth > MAX_IMPORT_DEPTH
    ctx.b.edge({ kind: 'imports', source: from.id, target: targetNode.id, label: `@${r.raw}`, data: { depth, external, depthExceeded } })
    if (depthExceeded) ctx.b.warn({ code: 'import.depth', severity: 'warn', message: `import chain deeper than ${MAX_IMPORT_DEPTH} at ${target}; Claude Code stops following imports here`, path: target, nodeId: targetNode.id })
  }
  return refs
}

async function scanImportedDoc(ctx: ScanContext, abs: string, o: ClaudeMdOptions, depth: number, ancestors: Set<string>): Promise<Node<'importedDoc'> | null> {
  const id = idOf('importedDoc', ctx.idPath(abs))
  const existing = ctx.b.get(id) as Node<'importedDoc'> | undefined
  if (existing) return existing
  const read = await readTextCapped(abs, MD_READ_MAX)
  if (!read) return null
  const entry = addFile(ctx, abs, {
    size: read.size,
    mtimeMs: read.mtimeMs,
    content: read.size <= INLINE_MD_MAX ? read.text : undefined,
    excerpt: read.size > INLINE_MD_MAX ? excerptOf(read.text) : undefined,
    truncated: read.truncated,
  })
  const lines = countLines(read.text)
  const node = ctx.b.node({
    id,
    kind: 'importedDoc',
    label: basenameOf(abs),
    scope: o.scope,
    layer: 'config',
    parentId: o.parentId,
    path: abs,
    fileId: entry.id,
    summary: `Pulled into the instructions by an @import, so Claude reads it at launch as if it were part of CLAUDE.md (${lines} lines).`,
    data: { lines, imports: [] },
    stats: { sizeBytes: read.size, lines },
  })
  if (depth <= MAX_IMPORT_DEPTH) node.data.imports = await resolveImports(ctx, node, abs, extractImports(read.text), o, depth + 1, ancestors)
  return node
}

/** .claude/rules/**.md -> rulesFile nodes; `paths:` frontmatter makes a rule lazy (loaded only for matching files). */
export async function scanRulesDir(ctx: ScanContext, dir: string, parentId: string, scope: Scope): Promise<Node<'rulesFile'>[]> {
  const out: Node<'rulesFile'>[] = []
  for await (const d of walkDirs(dir, { maxDepth: 3, skipDirs: new Set(['node_modules', '.git']), maxEntries: 2000 })) {
    for (const e of d.entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue
      const abs = joinPath(d.path, e.name)
      const read = await readTextCapped(abs, MD_READ_MAX)
      if (!read) continue
      const fm = parseFrontmatter(read.text)
      const paths = fm.data.paths !== undefined ? asStringList(fm.data.paths) : undefined
      const lazy = Boolean(paths && paths.length > 0)
      const entry = addFile(ctx, abs, { size: read.size, mtimeMs: read.mtimeMs, content: read.size <= INLINE_MD_MAX ? read.text : undefined, excerpt: read.size > INLINE_MD_MAX ? excerptOf(read.text) : undefined })
      const lines = countLines(read.text)
      out.push(
        ctx.b.node({
          id: idOf('rulesFile', ctx.idPath(abs)),
          kind: 'rulesFile',
          label: abs.slice(dir.length + 1),
          scope,
          layer: 'config',
          parentId,
          path: abs,
          fileId: entry.id,
          summary: lazy ? `Rule loaded only when Claude works on files matching ${paths?.join(', ')}.` : `Rule file loaded at launch alongside CLAUDE.md (${lines} lines).`,
          data: { paths, lazy, frontmatter: fm.data },
          stats: { sizeBytes: read.size, lines },
          loadTiming: lazy ? 'lazy' : 'startup',
        }),
      )
    }
  }
  return out
}

/** CLAUDE.md files in ancestor folders of a project (loaded at launch), excluding the user-scope one. */
export async function findAncestorClaudeMds(ctx: ScanContext, projectDir: string): Promise<string[]> {
  const found: string[] = []
  const userMd = pathKey(joinPath(ctx.paths.configDir, 'CLAUDE.md'), ctx.env.platform)
  let dir = dirnameOf(normalizePath(projectDir, ctx.env.platform))
  const seen = new Set<string>()
  while (dir && !seen.has(dir)) {
    seen.add(dir)
    for (const candidate of [joinPath(dir, 'CLAUDE.md'), joinPath(dir, '.claude/CLAUDE.md')]) {
      if (pathKey(candidate, ctx.env.platform) === userMd) continue
      const st = await statSafe(candidate)
      if (st?.isFile()) found.push(candidate)
    }
    const parent = dirnameOf(dir)
    if (parent === dir || parent === '.') break
    dir = parent
  }
  return found.reverse() // root first, the order Claude Code loads them
}
