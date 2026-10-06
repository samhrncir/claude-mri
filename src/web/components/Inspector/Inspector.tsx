import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from '../../../shared/glossary.js'
import { KIND_FAMILY } from '../../../shared/kinds.js'
import { titleOf } from '../../graph/buildGraph.js'
import { useAppStore } from '../../store/index.js'
import { Icon } from '../Icon.js'
import { ContentTab } from './ContentTab.js'
import { DetailsTab, LearnTab, OverviewTab, RelationshipsTab } from './tabs.js'

const TABS = ['Overview', 'Details', 'Content', 'Relationships', 'Learn'] as const
type Tab = (typeof TABS)[number]

export function Inspector() {
  const selectedId = useAppStore((s) => s.selectedId)
  const snapshot = useAppStore((s) => s.snapshot)
  const indexes = useAppStore((s) => s.indexes)
  const rfNode = useAppStore((s) => (selectedId ? s.rfNodes.find((n) => n.id === selectedId) : undefined))
  const width = useAppStore((s) => s.inspectorWidth)
  const setWidth = useAppStore((s) => s.setInspectorWidth)
  const select = useAppStore((s) => s.select)
  const toggle = useAppStore((s) => s.toggleExpanded)
  const [tab, setTab] = useState<Tab>('Overview')
  const dragging = useRef(false)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (dragging.current) setWidth(window.innerWidth - e.clientX)
    }
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [setWidth])

  if (!selectedId || !snapshot || !indexes) return <aside className="inspector inspector--closed" aria-label="Inspector" />
  const node = indexes.byId.get(selectedId)
  const style = { ['--inspector-w' as string]: `${width}px` } as React.CSSProperties

  if (!node) {
    // Synthesized section container.
    const kind = rfNode?.data.sectionKind
    return (
      <aside className="inspector" aria-label="Inspector" style={style}>
        <div className="inspector__resize" onMouseDown={() => (dragging.current = true)} role="separator" aria-orientation="vertical" />
        <div className="inspector__head">
          <div className="inspector__title">
            <span>{rfNode?.data.label ?? selectedId}</span>
            <button type="button" className="btn btn--tiny btn--ghost" style={{ marginLeft: 'auto' }} onClick={() => select(null)} aria-label="Close inspector">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="inspector__body">
          <p className="notice">{rfNode?.data.summary}</p>
          {kind ? (
            <>
              <h4>{titleOf(kind)}</h4>
              <p>{GLOSSARY[kind].what}</p>
            </>
          ) : null}
          <p>
            <button type="button" className="btn" onClick={() => toggle(selectedId)}>
              {rfNode?.data.collapsed ? 'Expand' : 'Collapse'} this group
            </button>
          </p>
        </div>
      </aside>
    )
  }

  const file = node.fileId ? snapshot.files[node.fileId] : undefined
  const kStyle = { ...style, ['--k' as string]: `var(--k-${KIND_FAMILY[node.kind]})` } as React.CSSProperties
  return (
    <aside className="inspector" aria-label="Inspector" style={kStyle}>
      <div className="inspector__resize" onMouseDown={() => (dragging.current = true)} role="separator" aria-orientation="vertical" aria-label="Resize inspector" />
      <div className="inspector__head">
        <div className="inspector__title">
          <Icon name={KIND_FAMILY[node.kind]} />
          <span>{node.label}</span>
          <button type="button" className="btn btn--tiny btn--ghost" style={{ marginLeft: 'auto' }} onClick={() => select(null)} aria-label="Close inspector">
            <Icon name="close" />
          </button>
        </div>
        <div className="inspector__chips">
          <span className="chip chip--k">{GLOSSARY[node.kind].title}</span>
          <span className="chip">{node.scope}</span>
          <span className="chip">{node.layer}</span>
          {node.loadTiming ? <span className="chip">{{ startup: 'loads at startup', lazy: 'loads on demand', onInvoke: 'loads when invoked', onEvent: 'runs on event', never: 'not loaded' }[node.loadTiming]}</span> : null}
          {(node.flags ?? []).map((f) => (
            <span key={f} className="chip" style={{ color: 'var(--danger)' }}>
              {f}
            </span>
          ))}
          {rfNode?.data.isContainer ? (
            <button type="button" className="chip" onClick={() => toggle(node.id)}>
              {rfNode.data.collapsed ? 'expand' : 'collapse'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Inspector sections">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="inspector__body" role="tabpanel">
        {tab === 'Overview' ? <OverviewTab node={node} indexes={indexes} /> : null}
        {tab === 'Details' ? <DetailsTab node={node} /> : null}
        {tab === 'Content' ? <ContentTab key={node.id} node={node} file={file} /> : null}
        {tab === 'Relationships' ? <RelationshipsTab node={node} indexes={indexes} /> : null}
        {tab === 'Learn' ? <LearnTab node={node} /> : null}
      </div>
    </aside>
  )
}
