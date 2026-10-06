// Small fuzzy scorer: subsequence match with bonuses for exact substrings, word starts and consecutive runs.

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (q === '') return 0
  if (t === q) return 1000
  const sub = t.indexOf(q)
  if (sub >= 0) return 500 - sub + (sub === 0 || /[^a-z0-9]/.test(t[sub - 1] ?? '') ? 100 : 0)
  let qi = 0
  let score = 0
  let run = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      const wordStart = ti === 0 || /[^a-z0-9]/.test(t[ti - 1] ?? '')
      score += 10 + run * 5 + (wordStart ? 15 : 0)
      run += 1
      qi += 1
    } else {
      run = 0
      score -= 1
    }
  }
  return qi === q.length ? Math.max(score, 1) : 0
}

export interface Searchable {
  id: string
  label: string
  invocation?: string
  path?: string
  summary?: string
}

export interface SearchHit<T extends Searchable> {
  item: T
  score: number
}

export function searchItems<T extends Searchable>(query: string, items: readonly T[], limit = 50): SearchHit<T>[] {
  if (query.trim() === '') return []
  const hits: SearchHit<T>[] = []
  for (const item of items) {
    const score = Math.max(
      fuzzyScore(query, item.label) * 3,
      item.invocation ? fuzzyScore(query, item.invocation) * 2 : 0,
      item.path ? fuzzyScore(query, item.path) : 0,
      item.summary ? fuzzyScore(query, item.summary) * 0.5 : 0,
    )
    if (score > 0) hits.push({ item, score })
  }
  hits.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
  return hits.slice(0, limit)
}
