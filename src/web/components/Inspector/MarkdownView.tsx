// Lazy-loaded markdown renderer: marked -> DOMPurify. Shared snapshots can come from strangers, so sanitize always.
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

let hooked = false

function ensureHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer')
      node.setAttribute('target', '_blank')
    }
  })
}

export function renderMarkdown(text: string): string {
  ensureHooks()
  const html = marked.parse(text, { async: false, gfm: true, breaks: false })
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'script', 'object', 'embed'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  })
}

export default function MarkdownView({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
