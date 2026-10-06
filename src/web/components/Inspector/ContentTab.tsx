import { Suspense, lazy, useEffect, useState } from 'react'
import type { FileEntry, Node } from '../../../shared/snapshot.js'
import { fetchFile } from '../../lib/api.js'
import { formatBytes } from '../../lib/format.js'
import { useAppStore } from '../../store/index.js'

const MarkdownView = lazy(() => import('./MarkdownView.js'))

function JsonView({ text }: { text: string }) {
  let pretty = text
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    // leave as is
  }
  return <pre>{pretty}</pre>
}

interface Remote {
  id: string
  text?: string
  error?: boolean
}

/** Mounted with key={node.id} by the Inspector, so state resets per node. */
export function ContentTab({ node, file }: { node: Node; file: FileEntry | undefined }) {
  const mode = useAppStore((s) => s.mode)
  const [remote, setRemote] = useState<Remote | null>(null)
  const needsFetch = Boolean(file && file.content === undefined && mode === 'local' && file.kind !== 'dir' && file.kind !== 'jsonl')

  useEffect(() => {
    if (!file || !needsFetch) return
    let cancelled = false
    fetchFile(file.id)
      .then((res) => {
        if (!cancelled) setRemote({ id: file.id, text: res.content })
      })
      .catch(() => {
        if (!cancelled) setRemote({ id: file.id, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [file, needsFetch])

  if (!file) return <p className="notice">This item has no file of its own.</p>
  if (file.kind === 'jsonl' || file.kind === 'dir') return <p className="notice">Transcripts and folders are never read into claude-mri ({formatBytes(file.size)}).</p>
  const text = file.content ?? (remote?.id === file.id ? remote.text : undefined)
  const loading = needsFetch && remote?.id !== file.id
  const failed = remote?.id === file.id && remote.error
  if (loading) return <p className="notice">Loading {formatBytes(file.size)}…</p>
  if (text === undefined) {
    return (
      <div className="content">
        <p className="notice">{mode === 'local' ? (failed ? 'The server could not read this file.' : 'Content not loaded.') : 'Full content is not included in shared snapshots.'}</p>
        {file.excerpt ? <pre>{file.excerpt}</pre> : null}
      </div>
    )
  }
  const isMarkdown = file.kind === 'markdown' || /\.md$/i.test(node.path ?? '')
  const isJson = file.kind === 'json'
  return (
    <div className="content">
      {file.contentIsNormalized ? <p className="notice">Shown re-serialized with secret-looking values redacted.</p> : null}
      {file.truncated ? <p className="notice">Only the first part of a large file is shown.</p> : null}
      {isMarkdown ? (
        <Suspense fallback={<pre>{text}</pre>}>
          <MarkdownView text={text} />
        </Suspense>
      ) : isJson ? (
        <JsonView text={text} />
      ) : (
        <pre>{text}</pre>
      )}
    </div>
  )
}
