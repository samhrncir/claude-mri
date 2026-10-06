// Recomputes the rendered graph whenever its inputs change: snapshot -> buildGraph -> layout (async) -> store.
import { buildGraph, HUGE_SNAPSHOT } from '../graph/buildGraph.js'
import { runLayout } from '../graph/layout/runLayout.js'
import { useAppStore } from './index.js'

let generation = 0
let started = false

export function startPipeline(): () => void {
  if (started) return () => undefined
  started = true
  const run = () => {
    const s = useAppStore.getState()
    if (!s.snapshot || !s.indexes) return
    generation += 1
    const mine = generation
    s.setLayoutRunning(mine)
    const built = buildGraph({ snapshot: s.snapshot, indexes: s.indexes, filters: s.filters, expanded: s.expanded, groupQuery: s.groupQuery })
    void runLayout(built.nodes, built.edges, s.positions, { forceFallback: s.snapshot.nodes.length > HUGE_SNAPSHOT }).then((result) => {
      useAppStore.getState().setLayout(result.nodes, built.edges, result.lanes, result.engine, mine)
    })
  }
  const unsub = useAppStore.subscribe(
    (s) => [s.snapshot, s.expanded, s.filters, s.groupQuery, s.indexes] as const,
    () => run(),
    { equalityFn: (a, b) => a.every((v, i) => v === b[i]) },
  )
  run()
  return () => {
    unsub()
    started = false
  }
}
