import { GLOSSARY, LAYER_GLOSSARY } from '../../shared/glossary.js'
import { FAMILIES, KIND_FAMILY, LAYERS, NODE_KINDS, type Family, type NodeKind } from '../../shared/kinds.js'
import { useAppStore } from '../store/index.js'

export function Filters() {
  const snapshot = useAppStore((s) => s.snapshot)
  const indexes = useAppStore((s) => s.indexes)
  const filters = useAppStore((s) => s.filters)
  const toggleLayer = useAppStore((s) => s.toggleLayer)
  const toggleKind = useAppStore((s) => s.toggleKind)
  const setFilters = useAppStore((s) => s.setFilters)
  const reveal = useAppStore((s) => s.revealNode)
  const open = useAppStore((s) => s.railOpen)
  if (!snapshot || !indexes) return <nav className={`rail ${open ? '' : 'rail--closed'}`} aria-label="Filters" />

  const layerCounts = new Map<string, number>()
  for (const n of snapshot.nodes) layerCounts.set(n.layer, (layerCounts.get(n.layer) ?? 0) + 1)
  const kindsByFamily = new Map<Family, NodeKind[]>()
  for (const k of NODE_KINDS) {
    if (!indexes.countsByKind[k] || k === 'machine') continue
    const f = KIND_FAMILY[k]
    kindsByFamily.set(f, [...(kindsByFamily.get(f) ?? []), k])
  }
  const warnings = snapshot.warnings

  return (
    <nav className={`rail ${open ? '' : 'rail--closed'}`} aria-label="Filters">
      <h3>Layers</h3>
      {LAYERS.map((layer) => (
        <button key={layer} type="button" className="rail__item" aria-pressed={filters.layers.has(layer)} onClick={() => toggleLayer(layer)} title={LAYER_GLOSSARY[layer].what}>
          <input type="checkbox" readOnly tabIndex={-1} checked={filters.layers.has(layer)} aria-hidden="true" />
          <span>{LAYER_GLOSSARY[layer].title}</span>
          <span className="count">{layerCounts.get(layer) ?? 0}</span>
        </button>
      ))}
      <p className="rail__hint">Configuration is the default lens; the other layers show where your data lives.</p>

      <h3>View</h3>
      <button type="button" className="rail__item" aria-pressed={filters.tokenView} onClick={() => setFilters({ tokenView: !filters.tokenView })} title="Scale a bar on skills, agents and commands by their always-on token cost (needs the claude CLI)">
        <input type="checkbox" readOnly tabIndex={-1} checked={filters.tokenView} aria-hidden="true" />
        <span>Token cost</span>
      </button>
      <button type="button" className="rail__item" aria-pressed={filters.problemsOnly} onClick={() => setFilters({ problemsOnly: !filters.problemsOnly })} title="Show only items with warnings, broken files, missing targets or ghosts">
        <input type="checkbox" readOnly tabIndex={-1} checked={filters.problemsOnly} aria-hidden="true" />
        <span>Only problems</span>
        <span className="count">{warnings.length}</span>
      </button>

      <h3>Kinds</h3>
      {FAMILIES.map((f) => {
        const kinds = kindsByFamily.get(f)
        if (!kinds) return null
        return (
          <div key={f} style={{ marginBottom: 8 }}>
            <div className="chips">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${filters.hiddenKinds.has(k) ? '' : 'chip--k'}`}
                  style={{ ['--k' as string]: `var(--k-${f})` } as React.CSSProperties}
                  aria-pressed={!filters.hiddenKinds.has(k)}
                  onClick={() => toggleKind(k)}
                  title={GLOSSARY[k].what}
                >
                  {GLOSSARY[k].title} <span style={{ opacity: 0.7 }}>{indexes.countsByKind[k]}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {warnings.length > 0 ? (
        <>
          <h3>Warnings ({warnings.length})</h3>
          {warnings.slice(0, 30).map((w, i) => (
            <button key={i} type="button" className="rail__item" onClick={() => (w.nodeId ? reveal(w.nodeId) : undefined)} title={w.message} style={{ fontSize: 12 }}>
              <span className="swatch" style={{ ['--k' as string]: w.severity === 'error' ? 'var(--danger)' : w.severity === 'warn' ? 'var(--warn)' : 'var(--faint)' } as React.CSSProperties} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.message}</span>
            </button>
          ))}
          {warnings.length > 30 ? <p className="rail__hint">…and {warnings.length - 30} more</p> : null}
        </>
      ) : null}
    </nav>
  )
}
