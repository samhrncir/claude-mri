// Skills (SKILL.md), subagents (agents/*.md) and legacy commands (commands/*.md) for every origin.
import { idOf } from '../../shared/ids.js'
import type { Scope } from '../../shared/kinds.js'
import type { AgentData, CommandData, ComponentOrigin, SkillData } from '../../shared/nodeData.js'
import type { FileEntry, Node } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'
import { MD_READ_MAX, addFile, excerptOf, fileExists } from './files.js'
import { readTextCapped, readdirSorted, walkDirs, type TextRead } from './fsx.js'
import { asBoolean, asString, asStringList, countLines, firstSentence, parseFrontmatter, type Frontmatter } from './frontmatter.js'
import { joinPath, relativeTo } from './paths.js'

export interface ComponentOwner {
  parentId: string
  scope: Scope
  origin: ComponentOrigin
  pluginName?: string
  pluginId?: string
  bucket?: string
}

export function skillInvocation(origin: ComponentOrigin, name: string, pluginName?: string): string {
  if (origin === 'plugin' && pluginName) return `/${pluginName}:${name}`
  if (origin === 'synced') return `/anthropic-skills:${name}`
  return `/${name}`
}

interface ComponentFile {
  fm: Frontmatter
  entry: FileEntry
  text: TextRead
}

async function readComponentFile(ctx: ScanContext, abs: string): Promise<ComponentFile | null> {
  const read = await readTextCapped(abs, MD_READ_MAX)
  if (!read) return null
  const fm = parseFrontmatter(read.text)
  const entry = addFile(ctx, abs, { size: read.size, mtimeMs: read.mtimeMs, excerpt: excerptOf(read.text), truncated: read.truncated })
  return { fm, entry, text: read }
}

function warnFrontmatter(ctx: ScanContext, abs: string, nodeId: string, fm: Frontmatter): void {
  if (fm.errors.length === 0) return
  ctx.b.warn({ code: 'frontmatter.parse', severity: 'info', message: `${abs}: ${fm.errors[0]}`, path: abs, nodeId })
}

const ORIGIN_TEXT: Record<ComponentOrigin, string> = {
  personal: 'personal (available in every project)',
  project: 'project-level (this repository only)',
  plugin: 'provided by a plugin',
  synced: 'synced from your claude.ai account',
}

export async function scanSkillFile(ctx: ScanContext, abs: string, dirName: string, owner: ComponentOwner): Promise<Node<'skill'> | null> {
  const id = idOf('skill', ctx.idPath(abs))
  const existing = ctx.b.get(id) as Node<'skill'> | undefined
  if (existing) return existing
  const r = await readComponentFile(ctx, abs)
  if (!r) return null
  const d = r.fm.data
  const name = asString(d.name) ?? dirName
  const data: SkillData = {
    name,
    description: asString(d.description),
    invocation: skillInvocation(owner.origin, name, owner.pluginName),
    origin: owner.origin,
    pluginId: owner.pluginId,
    bucket: owner.bucket,
    frontmatter: d,
    allowedTools: d['allowed-tools'] !== undefined ? asStringList(d['allowed-tools']) : undefined,
    userInvocable: asBoolean(d['user-invocable']),
    disableModelInvocation: asBoolean(d['disable-model-invocation']),
    context: asString(d.context),
    model: asString(d.model),
    paths: d.paths !== undefined ? asStringList(d.paths) : undefined,
    hasHooks: d.hooks !== undefined,
  }
  const who = data.disableModelInvocation ? 'Only you can invoke it' : data.userInvocable === false ? 'Only Claude invokes it' : 'You or Claude can invoke it'
  const desc = firstSentence(data.description)
  const node = ctx.b.node({
    id,
    kind: 'skill',
    label: name,
    scope: owner.scope,
    layer: 'config',
    parentId: owner.parentId,
    path: abs,
    fileId: r.entry.id,
    summary: `${desc ? `${desc} ` : ''}Skill ${ORIGIN_TEXT[owner.origin]}; ${who} as ${data.invocation}.`,
    data,
    stats: { sizeBytes: r.text.size, lines: countLines(r.text.text) },
  })
  warnFrontmatter(ctx, abs, id, r.fm)
  return node
}

/** `<dir>/<name>/SKILL.md` one level deep, plus a direct `<dir>/SKILL.md`. */
export async function scanSkillsDir(ctx: ScanContext, dir: string, owner: ComponentOwner): Promise<Node<'skill'>[]> {
  const out: Node<'skill'>[] = []
  const direct = joinPath(dir, 'SKILL.md')
  if (await fileExists(direct)) {
    const n = await scanSkillFile(ctx, direct, dir.split('/').pop() ?? 'skill', owner)
    if (n) out.push(n)
  }
  for (const e of await readdirSorted(dir)) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    const skillFile = joinPath(dir, e.name, 'SKILL.md')
    if (!(await fileExists(skillFile))) continue
    const n = await scanSkillFile(ctx, skillFile, e.name, owner)
    if (n) out.push(n)
  }
  return out
}

export async function scanAgentFile(ctx: ScanContext, abs: string, owner: ComponentOwner): Promise<Node<'agent'> | null> {
  const id = idOf('agent', ctx.idPath(abs))
  const existing = ctx.b.get(id) as Node<'agent'> | undefined
  if (existing) return existing
  const r = await readComponentFile(ctx, abs)
  if (!r) return null
  const d = r.fm.data
  const name = asString(d.name) ?? (abs.split('/').pop() ?? '').replace(/\.md$/i, '')
  const data: AgentData = {
    name,
    description: asString(d.description),
    origin: owner.origin,
    pluginId: owner.pluginId,
    tools: d.tools !== undefined ? asStringList(d.tools) : undefined,
    disallowedTools: d.disallowedTools !== undefined ? asStringList(d.disallowedTools) : undefined,
    model: asString(d.model),
    permissionMode: asString(d.permissionMode),
    skills: d.skills !== undefined ? asStringList(d.skills) : undefined,
    mcpServers: d.mcpServers !== undefined ? asStringList(d.mcpServers) : undefined,
    memory: asString(d.memory),
    frontmatter: d,
    hasHooks: d.hooks !== undefined,
  }
  const desc = firstSentence(data.description)
  const tools = data.tools ? `limited to ${data.tools.length} tool${data.tools.length === 1 ? '' : 's'}` : 'with all tools'
  const node = ctx.b.node({
    id,
    kind: 'agent',
    label: name,
    scope: owner.scope,
    layer: 'config',
    parentId: owner.parentId,
    path: abs,
    fileId: r.entry.id,
    summary: `${desc ? `${desc} ` : ''}Subagent ${ORIGIN_TEXT[owner.origin]}, ${tools}${data.model ? `, model ${data.model}` : ''}; Claude delegates to it in a separate context.`,
    data,
    stats: { sizeBytes: r.text.size, lines: countLines(r.text.text) },
  })
  warnFrontmatter(ctx, abs, id, r.fm)
  return node
}

export async function scanAgentsDir(ctx: ScanContext, dir: string, owner: ComponentOwner): Promise<Node<'agent'>[]> {
  const out: Node<'agent'>[] = []
  for await (const d of walkDirs(dir, { maxDepth: 1, skipDirs: new Set(['node_modules', '.git']), maxEntries: 2000 })) {
    for (const e of d.entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue
      const n = await scanAgentFile(ctx, joinPath(d.path, e.name), owner)
      if (n) out.push(n)
    }
  }
  return out
}

export async function scanCommandFile(ctx: ScanContext, abs: string, rootDir: string, owner: ComponentOwner): Promise<Node<'command'> | null> {
  const id = idOf('command', ctx.idPath(abs))
  const existing = ctx.b.get(id) as Node<'command'> | undefined
  if (existing) return existing
  const r = await readComponentFile(ctx, abs)
  if (!r) return null
  const d = r.fm.data
  const rel = relativeTo(rootDir, abs, ctx.env.platform) ?? abs
  const parts = rel.split('/')
  const file = parts.pop() ?? rel
  const name = asString(d.name) ?? file.replace(/\.md$/i, '')
  const namespace = parts.length > 0 ? parts.join(':') : undefined
  const prefix = owner.origin === 'plugin' && owner.pluginName ? `${owner.pluginName}:` : ''
  const invocation = `/${prefix}${namespace ? `${namespace}:` : ''}${name}`
  const data: CommandData = { name, namespace, description: asString(d.description), invocation, origin: owner.origin, pluginId: owner.pluginId, frontmatter: d }
  const desc = firstSentence(data.description)
  const node = ctx.b.node({
    id,
    kind: 'command',
    label: name,
    scope: owner.scope,
    layer: 'config',
    parentId: owner.parentId,
    path: abs,
    fileId: r.entry.id,
    summary: `${desc ? `${desc} ` : ''}Legacy slash command ${ORIGIN_TEXT[owner.origin]}, run as ${invocation}; skills are the newer form.`,
    data,
    stats: { sizeBytes: r.text.size, lines: countLines(r.text.text) },
  })
  warnFrontmatter(ctx, abs, id, r.fm)
  return node
}

export async function scanCommandsDir(ctx: ScanContext, dir: string, owner: ComponentOwner): Promise<Node<'command'>[]> {
  const out: Node<'command'>[] = []
  for await (const d of walkDirs(dir, { maxDepth: 3, skipDirs: new Set(['node_modules', '.git']), maxEntries: 5000 })) {
    for (const e of d.entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue
      const n = await scanCommandFile(ctx, joinPath(d.path, e.name), dir, owner)
      if (n) out.push(n)
    }
  }
  return out
}

/** output-styles/*.md -> outputStyle nodes. */
export async function scanOutputStylesDir(ctx: ScanContext, dir: string, parentId: string, scope: Scope): Promise<Node<'outputStyle'>[]> {
  const out: Node<'outputStyle'>[] = []
  for (const e of await readdirSorted(dir)) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue
    const abs = joinPath(dir, e.name)
    const r = await readComponentFile(ctx, abs)
    if (!r) continue
    const name = asString(r.fm.data.name) ?? e.name.replace(/\.md$/i, '')
    out.push(
      ctx.b.node({
        id: idOf('outputStyle', ctx.idPath(abs)),
        kind: 'outputStyle',
        label: name,
        scope,
        layer: 'config',
        parentId,
        path: abs,
        fileId: r.entry.id,
        summary: `${firstSentence(asString(r.fm.data.description)) ?? 'Output style'}; replaces the tone-and-format part of the system prompt when selected.`,
        data: { name, description: asString(r.fm.data.description), frontmatter: r.fm.data },
        stats: { sizeBytes: r.text.size },
      }),
    )
  }
  return out
}
