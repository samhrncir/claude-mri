// Neighbourhood helpers over the rendered graph (used for hover highlighting and focus mode).
import type { GraphEdge, Highlight } from '../store/types.js'

export function neighborhood(rootId: string, edges: readonly GraphEdge[], hops: number, parentOf: (id: string) => string | undefined): Highlight {
  const nodeIds = new Set<string>([rootId])
  const edgeIds = new Set<string>()
  let frontier = [rootId]
  for (let h = 0; h < hops; h += 1) {
    const next: string[] = []
    for (const e of edges) {
      const touchesSource = frontier.includes(e.source)
      const touchesTarget = frontier.includes(e.target)
      if (!touchesSource && !touchesTarget) continue
      edgeIds.add(e.id)
      const other = touchesSource ? e.target : e.source
      if (!nodeIds.has(other)) {
        nodeIds.add(other)
        next.push(other)
      }
    }
    frontier = next
  }
  // Containers of highlighted nodes stay visible so the context is readable.
  for (const id of Array.from(nodeIds)) {
    let p = parentOf(id)
    while (p) {
      nodeIds.add(p)
      p = parentOf(p)
    }
  }
  return { nodeIds, edgeIds }
}
