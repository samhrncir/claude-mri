import { useReactFlow } from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import { GLOSSARY } from '../../shared/glossary.js'
import { useAppStore } from '../store/index.js'
import { TOUR_STOPS } from '../tour/stops.js'
import { Icon } from './Icon.js'

export function Tour() {
  const rf = useReactFlow()
  const tour = useAppStore((s) => s.tour)
  const step = tour?.step ?? 0
  const indexes = useAppStore((s) => s.indexes)
  const rfNodes = useAppStore((s) => s.rfNodes)
  const layoutStatus = useAppStore((s) => s.layoutStatus)
  const stop = TOUR_STOPS[Math.min(step, TOUR_STOPS.length - 1)]
  const picked = useMemo(() => (stop && indexes ? stop.pick(indexes) : []), [stop, indexes])

  // Make sure the needed layers are on and the containers around the picked nodes are open.
  useEffect(() => {
    if (!stop || !indexes) return
    const s = useAppStore.getState()
    const layers = new Set(s.filters.layers)
    for (const l of stop.layers ?? []) layers.add(l)
    if (layers.size !== s.filters.layers.size) s.setFilters({ layers })
    const expanded = { ...s.expanded }
    let changed = false
    for (const id of picked.slice(0, 200)) {
      let p = indexes.parentOf.get(id)
      while (p) {
        if (indexes.byId.get(p)?.kind !== 'machine' && expanded[p] !== true) {
          expanded[p] = true
          changed = true
        }
        p = indexes.parentOf.get(p)
      }
    }
    if (changed) useAppStore.setState({ expanded })
  }, [stop, indexes, picked])

  // Once laid out, highlight and frame the picked nodes (or their collapsed stand-ins).
  useEffect(() => {
    if (!stop || layoutStatus === 'running') return
    const rendered = new Set(rfNodes.map((n) => n.id))
    const parentOf = new Map(rfNodes.map((n) => [n.id, n.parentId]))
    const ids = new Set<string>()
    for (const id of picked) {
      let cur: string | undefined = id
      while (cur && !rendered.has(cur)) cur = indexes?.parentOf.get(cur)
      if (cur) ids.add(cur)
    }
    for (const id of Array.from(ids)) {
      let p = parentOf.get(id)
      while (p) {
        ids.add(p)
        p = parentOf.get(p)
      }
    }
    const edgeIds = new Set(useAppStore.getState().rfEdges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => e.id))
    useAppStore.setState({ highlight: ids.size > 0 ? { nodeIds: ids, edgeIds } : null })
    if (ids.size > 0) {
      const frame = Array.from(ids)
        .filter((id) => !rfNodes.find((n) => n.id === id)?.parentId || picked.includes(id))
        .slice(0, 60)
      const t = setTimeout(() => void rf.fitView({ nodes: frame.map((id) => ({ id })), duration: 600, padding: 0.25, maxZoom: 1.1 }), 50)
      return () => clearTimeout(t)
    }
    return undefined
  }, [stop, picked, rfNodes, layoutStatus, rf, indexes])

  if (!stop) return null
  const last = step >= TOUR_STOPS.length - 1
  const next = () => (last ? useAppStore.getState().endTour() : useAppStore.getState().tourStep(1))
  return (
    <div className="tour" role="dialog" aria-live="polite" aria-label={`Tour step ${step + 1} of ${TOUR_STOPS.length}`}>
      <div className="tour__step">
        Step {step + 1} of {TOUR_STOPS.length}
      </div>
      <h3>{stop.title}</h3>
      <p>{stop.body}</p>
      {picked.length === 0 ? (
        <p className="notice">
          {stop.empty} <em>{GLOSSARY[stop.learnKind].what}</em>
        </p>
      ) : null}
      <div className="tour__actions">
        <button type="button" className="btn" onClick={() => useAppStore.getState().tourStep(-1)} disabled={step === 0}>
          Back
        </button>
        <button type="button" className="btn btn--primary" onClick={next}>
          {last ? 'Finish' : 'Next'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => useAppStore.getState().endTour()} aria-label="Exit tour">
          <Icon name="close" /> Exit
        </button>
        <span className="tour__dots" aria-hidden="true">
          {TOUR_STOPS.map((s, i) => (
            <span key={s.id} className={`tour__dot ${i === step ? 'tour__dot--on' : ''}`} />
          ))}
        </span>
      </div>
    </div>
  )
}
