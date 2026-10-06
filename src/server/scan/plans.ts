// ~/.claude/plans/*.md: the plans Claude writes in Plan Mode.
import { idOf } from '../../shared/ids.js'
import type { ScanContext } from './context.js'
import { INLINE_MD_MAX, MD_READ_MAX, addFile, dirExists, excerptOf } from './files.js'
import { readTextCapped, readdirSorted } from './fsx.js'
import { countLines } from './frontmatter.js'
import { joinPath } from './paths.js'

export async function scanPlans(ctx: ScanContext): Promise<void> {
  const dir = joinPath(ctx.paths.configDir, 'plans')
  if (!(await dirExists(dir))) return
  for (const e of await readdirSorted(dir)) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue
    const abs = joinPath(dir, e.name)
    const read = await readTextCapped(abs, MD_READ_MAX)
    if (!read) continue
    const slug = e.name.replace(/\.md$/i, '')
    const title = read.text.match(/^#\s+(.+?)\s*$/m)?.[1] ?? slug
    const entry = addFile(ctx, abs, { size: read.size, mtimeMs: read.mtimeMs, content: read.size <= INLINE_MD_MAX ? read.text : undefined, excerpt: read.size > INLINE_MD_MAX ? excerptOf(read.text) : undefined })
    const lines = countLines(read.text)
    ctx.b.node({
      id: idOf('plan', ctx.idPath(abs)),
      kind: 'plan',
      label: title.length > 60 ? `${title.slice(0, 57)}…` : title,
      scope: 'user',
      layer: 'plans',
      parentId: ctx.ids.userScope,
      path: abs,
      fileId: entry.id,
      summary: `Plan written in Plan Mode (${lines} lines); kept so you can revisit the reasoning behind a change.`,
      data: { title, slug },
      stats: { sizeBytes: read.size, lines, lastUsedAt: new Date(read.mtimeMs).toISOString() },
      loadTiming: 'never',
    })
  }
}
