export function formatBytes(n: number | undefined): string {
  if (n === undefined) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTokens(n: number | undefined): string {
  if (n === undefined) return ''
  if (n < 1000) return `${n} tok`
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k tok`
  return `${Math.round(n / 1000)}k tok`
}

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diff = Math.max(0, now - t)
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 60) return `${d} d ago`
  return new Date(t).toLocaleDateString()
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`
}

export function shortPath(path: string | undefined, max = 60): string {
  if (!path) return ''
  if (path.length <= max) return path
  const parts = path.split('/')
  let out = parts[parts.length - 1] ?? path
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const next = `${parts[i]}/${out}`
    if (next.length > max - 2) return `…/${out}`
    out = next
  }
  return out
}

export function titleCase(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}
