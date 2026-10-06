// Auto-memory: ~/.claude/projects/<encoded>/memory/MEMORY.md and its topic files, attached to their project.
import { idOf } from '../../shared/ids.js'
import type { ScanContext } from './context.js'
import { INLINE_MD_MAX, MD_READ_MAX, addFile, dirExists, excerptOf } from './files.js'
import { dirSummary, readTextCapped, readdirSorted } from './fsx.js'
import { asString, countLines, parseFrontmatter } from './frontmatter.js'
import { basenameOf, joinPath } from './paths.js'
import type { ProjectDiscovery } from './projects.js'

const LINK_ENTRY_RE = /^\s*[-*]\s*\[[^\]]+\]\([^)]+\)/

export async function scanMemory(ctx: ScanContext, discovery: ProjectDiscovery): Promise<void> {
  const projectsDir = joinPath(ctx.paths.configDir, 'projects')
  for (const c of discovery.candidates) {
    if (!c.node) continue
    let count = 0
    for (const enc of c.encodedDirs) {
      const memDir = joinPath(projectsDir, enc, 'memory')
      if (!(await dirExists(memDir))) continue
      const files = (await readdirSorted(memDir)).filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      if (files.length === 0) continue
      let indexId: string | undefined
      const indexFile = files.find((e) => e.name === 'MEMORY.md')
      if (indexFile) {
        const abs = joinPath(memDir, indexFile.name)
        const read = await readTextCapped(abs, MD_READ_MAX)
        if (read) {
          const entry = addFile(ctx, abs, { size: read.size, mtimeMs: read.mtimeMs, content: read.size <= INLINE_MD_MAX ? read.text : undefined, excerpt: read.size > INLINE_MD_MAX ? excerptOf(read.text) : undefined })
          const entries = read.text.split(/\r?\n/).filter((l) => LINK_ENTRY_RE.test(l)).length
          const lines = countLines(read.text)
          const node = ctx.b.node({
            id: idOf('memoryIndex', ctx.idPath(abs)),
            kind: 'memoryIndex',
            label: 'MEMORY.md',
            scope: 'local',
            layer: 'memory',
            parentId: c.node.id,
            path: abs,
            fileId: entry.id,
            summary: `Claude's own notes about this project: an index of ${entries} memor${entries === 1 ? 'y' : 'ies'} (${lines} lines). The first 200 lines load at the start of every session here.`,
            data: { projectPath: c.path, entries },
            stats: { sizeBytes: read.size, lines, lastUsedAt: new Date(read.mtimeMs).toISOString() },
          })
          indexId = node.id
          ctx.b.edge({ kind: 'remembers', source: c.node.id, target: node.id, label: 'auto memory' })
          count += 1
        }
      }
      for (const f of files) {
        if (f.name === 'MEMORY.md') continue
        const abs = joinPath(memDir, f.name)
        const read = await readTextCapped(abs, MD_READ_MAX)
        if (!read) continue
        const fm = parseFrontmatter(read.text)
        const meta = fm.data.metadata && typeof fm.data.metadata === 'object' ? (fm.data.metadata as Record<string, unknown>) : {}
        const entry = addFile(ctx, abs, { size: read.size, mtimeMs: read.mtimeMs, excerpt: excerptOf(read.text) })
        const type = asString(meta.type) ?? asString(fm.data.type)
        const description = asString(fm.data.description)
        ctx.b.node({
          id: idOf('memoryFile', ctx.idPath(abs)),
          kind: 'memoryFile',
          label: asString(fm.data.name) ?? basenameOf(abs).replace(/\.md$/i, ''),
          scope: 'local',
          layer: 'memory',
          parentId: indexId ?? c.node.id,
          path: abs,
          fileId: entry.id,
          summary: `${description ?? 'Memory note'}${type ? ` (${type})` : ''}. Read on demand when MEMORY.md points at it.`,
          data: { name: asString(fm.data.name), description, type },
          stats: { sizeBytes: read.size, lines: countLines(read.text), lastUsedAt: new Date(read.mtimeMs).toISOString() },
        })
        count += 1
      }
    }
    c.node.data.memoryFileCount = count
  }

  for (const dir of discovery.unmatchedProjectDirs) {
    const s = await dirSummary(dir)
    const node = ctx.b.node({
      id: idOf('stateDir', ctx.idPath(dir)),
      kind: 'stateDir',
      label: `projects/${basenameOf(dir)}/`,
      scope: 'user',
      layer: 'state',
      parentId: ctx.ids.userScope,
      path: dir,
      summary: `Session data for a project folder claude-mri could not map back to a path (${s.fileCount} files). Its transcripts carry no cwd, or the folder was renamed.`,
      data: { purpose: 'unmapped project data', fileCount: s.fileCount, totalBytes: s.totalBytes, shallow: s.shallow },
      stats: { fileCount: s.fileCount, sizeBytes: s.totalBytes },
      flags: ['ghost'],
    })
    ctx.b.warn({ code: 'transcript.noCwd', severity: 'info', message: `${dir} could not be mapped to a project folder`, path: dir, nodeId: node.id })
  }
}
