import { useAppStore } from '../../store/index.js'
import { Icon } from '../Icon.js'

export function FocusPill() {
  const selectedId = useAppStore((s) => s.selectedId)
  const focus = useAppStore((s) => s.focus)
  const setFocus = useAppStore((s) => s.setFocus)
  const label = useAppStore((s) => (selectedId ? s.indexes?.byId.get(selectedId)?.label ?? s.rfNodes.find((n) => n.id === selectedId)?.data.label : undefined))
  if (!selectedId) return null
  const hops = focus?.hops ?? 0
  return (
    <div className="focus-pill" role="group" aria-label="Focus mode">
      <span>
        {focus ? 'Focus' : 'Selected'}: <strong>{label}</strong>
      </span>
      {[1, 2, 3].map((h) => (
        <button key={h} type="button" className="btn btn--tiny" aria-pressed={hops === h} onClick={() => setFocus(selectedId, h as 1 | 2 | 3)} title={`Show ${h} hop${h === 1 ? '' : 's'} around the selection`}>
          {h} hop{h === 1 ? '' : 's'}
        </button>
      ))}
      {focus ? (
        <button type="button" className="btn btn--tiny btn--ghost" onClick={() => setFocus(null)} aria-label="Exit focus">
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  )
}
