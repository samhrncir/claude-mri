// Custom React Flow nodes. All memoized; colours come from CSS tokens via the --k variable.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { GLOSSARY } from '../../../shared/glossary.js'
import type { NodeKind } from '../../../shared/kinds.js'
import { titleOf } from '../../graph/buildGraph.js'
import { formatTokens } from '../../lib/format.js'
import { useAppStore } from '../../store/index.js'
import type { GraphNode, RFNodeData } from '../../store/types.js'
import { Icon } from '../Icon.js'

function useDim(id: string): { dimmed: boolean; lit: boolean } {
  const dimmed = useAppStore((s) => (s.highlight ? !s.highlight.nodeIds.has(id) : false))
  const lit = useAppStore((s) => (s.highlight ? s.highlight.nodeIds.has(id) && (s.hoverId === id || s.focus?.rootId === id) : false))
  return { dimmed, lit }
}

function kStyle(data: RFNodeData): CSSProperties {
  return { ['--k' as string]: `var(--k-${data.family})` } as CSSProperties
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="handle-hidden" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="handle-hidden" isConnectable={false} />
    </>
  )
}

function Flags({ data }: { data: RFNodeData }) {
  const flag = data.flags.find((f) => f === 'broken' || f === 'missing' || f === 'ghost' || f === 'disabled' || f === 'orphan' || f === 'external' || f === 'legacy')
  if (!flag && !data.hasProblem) return null
  return <span className="flag">{flag ?? 'warning'}</span>
}

const TIMING_TEXT = { startup: 'loaded at startup', lazy: 'loaded on demand', onInvoke: 'loaded when invoked', onEvent: 'runs on its event', never: 'not loaded into sessions' } as const

function Timing({ data }: { data: RFNodeData }) {
  if (!data.loadTiming) return null
  const text = TIMING_TEXT[data.loadTiming]
  return <span className={`timing timing--${data.loadTiming}`} title={text} aria-label={text} />
}

export function kindTitle(data: RFNodeData): string {
  return data.kind === 'section' ? titleOf(data.sectionKind ?? 'skill') : GLOSSARY[data.kind].title
}

export function countsLabel(data: RFNodeData): string {
  return data.counts
    .slice(0, 4)
    .map((c) => `${c.n} ${titleOf(c.kind as NodeKind).toLowerCase()}`)
    .join(' · ')
}

export const CardNode = memo(function CardNode({ id, data }: NodeProps<GraphNode>) {
  const { dimmed, lit } = useDim(id)
  const d = data
  return (
    <div className={`${dimmed ? 'is-dimmed' : ''} ${lit ? 'is-lit' : ''}`} style={{ width: '100%', height: '100%' }}>
      <div className={`card ${d.hasProblem ? 'has-problem' : ''}`} style={kStyle(d)} role="group" aria-label={`${kindTitle(d)}: ${d.label}`}>
        <div className="card__head">
          <Icon name={d.family} className="card__icon" />
          <span className="card__label" title={d.label}>
            {d.label}
          </span>
          <Timing data={d} />
        </div>
        <div className="card__summary" title={d.summary}>
          {d.invocation ? `${d.invocation} · ` : ''}
          {d.summary}
        </div>
        <div className="card__foot">
          <span className="chip">{kindTitle(d)}</span>
          {d.stats?.tokensAlwaysOn !== undefined ? <span className="chip">{formatTokens(d.stats.tokensAlwaysOn)}</span> : null}
          <Flags data={d} />
        </div>
        {d.tokenShare !== undefined ? <div className="card__tokenbar" style={{ width: `${Math.max(4, d.tokenShare * 100)}%` }} /> : null}
      </div>
      <Handles />
    </div>
  )
})

export const PillNode = memo(function PillNode({ id, data }: NodeProps<GraphNode>) {
  const { dimmed, lit } = useDim(id)
  const d = data
  const effect = d.ruleEffect ? `pill--${d.ruleEffect}` : ''
  return (
    <div className={`${dimmed ? 'is-dimmed' : ''} ${lit ? 'is-lit' : ''}`} style={{ width: '100%', height: '100%' }}>
      <div className={`pill ${d.kind === 'permissionRule' ? 'pill--rule' : ''} ${effect}`} style={kStyle(d)} title={d.summary} role="group" aria-label={`${kindTitle(d)}: ${d.label}`}>
        {d.ruleEffect ? <span className="chip">{d.ruleEffect}</span> : <Icon name={d.family} className="card__icon" />}
        <span className="pill__label">{d.label}</span>
        <Timing data={d} />
      </div>
      <Handles />
    </div>
  )
})

export const CollapsedNode = memo(function CollapsedNode({ id, data }: NodeProps<GraphNode>) {
  const { dimmed, lit } = useDim(id)
  const toggle = useAppStore((s) => s.toggleExpanded)
  const d = data
  return (
    <div className={`${dimmed ? 'is-dimmed' : ''} ${lit ? 'is-lit' : ''}`} style={{ width: '100%', height: '100%' }}>
      <div className="collapsed" style={kStyle(d)} onDoubleClick={() => toggle(id, true)} role="group" aria-label={`${kindTitle(d)}: ${d.label}, collapsed`} title="Double-click to expand">
        <div className="collapsed__title">
          <Icon name={d.family} />
          <span>{d.label}</span>
          <Flags data={d} />
        </div>
        <div className="collapsed__counts">{countsLabel(d) || `${d.childCount} items`}</div>
        <div className="collapsed__hint">double-click to expand · {kindTitle(d)}</div>
      </div>
      <Handles />
    </div>
  )
})

export const ContainerNode = memo(function ContainerNode({ id, data }: NodeProps<GraphNode>) {
  const { dimmed } = useDim(id)
  const toggle = useAppStore((s) => s.toggleExpanded)
  const query = useAppStore((s) => s.groupQuery[id] ?? '')
  const setQuery = useAppStore((s) => s.setGroupQuery)
  const d = data
  return (
    <div className={dimmed ? 'is-dimmed' : ''} style={{ width: '100%', height: '100%' }}>
      <div className={`group ${d.kind === 'section' ? 'group--section' : ''}`} style={kStyle(d)} role="group" aria-label={`${kindTitle(d)}: ${d.label}`}>
        <div className="group__header" onDoubleClick={() => toggle(id, false)}>
          <Icon name={d.family} />
          <span className="group__title">{d.label}</span>
          <span className="group__counts">{countsLabel(d)}</span>
          {d.childCount > 8 ? (
            <input className="group__search nodrag nopan nowheel" placeholder={`filter ${d.childCount}…`} value={query} onChange={(e) => setQuery(id, e.target.value)} aria-label={`Filter items in ${d.label}`} />
          ) : null}
          <button type="button" className={`btn btn--tiny btn--ghost nodrag nopan ${d.childCount > 8 ? '' : 'group__toggle'}`} onClick={() => toggle(id, false)} aria-label={`Collapse ${d.label}`}>
            <Icon name="collapse" />
          </button>
        </div>
      </div>
      <Handles />
    </div>
  )
})

export const NODE_TYPES = { card: CardNode, pill: PillNode, collapsed: CollapsedNode, container: ContainerNode } as const
