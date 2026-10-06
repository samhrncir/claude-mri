import { EDGE_GLOSSARY, GLOSSARY, docsUrl } from '../../../shared/glossary.js'
import { KIND_FAMILY, type EdgeKind } from '../../../shared/kinds.js'
import type { Edge, Node } from '../../../shared/snapshot.js'
import { whyIsThisHere } from '../../graph/why.js'
import { openInFileManager } from '../../lib/api.js'
import { formatBytes, formatTokens, relativeTime } from '../../lib/format.js'
import { useAppStore } from '../../store/index.js'
import type { Indexes } from '../../store/types.js'
import { Icon } from '../Icon.js'

function Row({ k, v }: { k: string; v: unknown }) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null
  const text = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) && v.every((x) => typeof x !== 'object') ? v.join(', ') : JSON.stringify(v, null, 1)
  return (
    <>
      <dt title={k}>{k}</dt>
      <dd>{text.length > 400 ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</pre> : text}</dd>
    </>
  )
}

export function OverviewTab({ node, indexes }: { node: Node; indexes: Indexes }) {
  const mode = useAppStore((s) => s.mode)
  const toast = useAppStore((s) => s.toast)
  const warnings = indexes.warningsByNode.get(node.id) ?? []
  const why = whyIsThisHere(node, indexes)
  const copy = () => {
    if (node.path) void navigator.clipboard?.writeText(node.path).then(() => toast('Path copied'))
  }
  return (
    <div>
      {node.path ? (
        <>
          <h4>Path</h4>
          <div className="pathrow">
            <code title={node.path}>{node.path}</code>
            <button type="button" className="btn btn--tiny" onClick={copy} aria-label="Copy path">
              <Icon name="copy" />
            </button>
            {mode === 'local' ? (
              <button type="button" className="btn btn--tiny" onClick={() => void openInFileManager(node.id).catch(() => toast('Could not open the folder'))} aria-label="Open folder">
                <Icon name="folder" />
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      <h4>Summary</h4>
      <p style={{ margin: 0 }}>{node.summary}</p>
      {node.stats ? (
        <>
          <h4>Stats</h4>
          <div className="chips">
            {node.stats.sizeBytes !== undefined ? <span className="chip">{formatBytes(node.stats.sizeBytes)}</span> : null}
            {node.stats.lines !== undefined ? <span className="chip">{node.stats.lines} lines</span> : null}
            {node.stats.fileCount !== undefined ? <span className="chip">{node.stats.fileCount} files</span> : null}
            {node.stats.tokensAlwaysOn !== undefined ? <span className="chip" title="Projected tokens added to every session">{formatTokens(node.stats.tokensAlwaysOn)} always-on</span> : null}
            {node.stats.tokensOnInvoke !== undefined ? <span className="chip" title="Projected tokens when invoked">{formatTokens(node.stats.tokensOnInvoke)} on invoke</span> : null}
            {node.stats.usageCount !== undefined ? <span className="chip">used {node.stats.usageCount}×</span> : null}
            {node.stats.lastUsedAt ? <span className="chip">{relativeTime(node.stats.lastUsedAt)}</span> : null}
            {node.stats.sessionCount !== undefined ? <span className="chip">{node.stats.sessionCount} sessions</span> : null}
            {node.stats.costUSD !== undefined ? <span className="chip">${node.stats.costUSD.toFixed(2)}</span> : null}
          </div>
        </>
      ) : null}
      {why.length > 0 ? (
        <>
          <h4>Why is this here?</h4>
          <ul className="why">
            {why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      ) : null}
      {warnings.length > 0 ? (
        <>
          <h4>Warnings</h4>
          {warnings.map((w, i) => (
            <p key={i} className="notice" style={{ marginBottom: 6 }}>
              <Icon name="warning" style={{ width: 12, height: 12, verticalAlign: '-2px', color: 'var(--warn)' }} /> {w.message}
            </p>
          ))}
        </>
      ) : null}
    </div>
  )
}

export function DetailsTab({ node }: { node: Node }) {
  const data = node.data as Record<string, unknown>
  const entries = Object.entries(data).filter(([k]) => k !== 'frontmatter' && k !== 'effective')
  const fm = data.frontmatter && typeof data.frontmatter === 'object' ? (data.frontmatter as Record<string, unknown>) : null
  const effective = data.effective && typeof data.effective === 'object' ? (data.effective as { permissions: { allow: { value: string; level: string }[]; deny: { value: string; level: string }[]; ask: { value: string; level: string }[] }; model?: { value: string; level: string }; env: Record<string, { value: string; level: string }>; enabledPlugins: Record<string, { value: boolean; level: string }> }) : null
  return (
    <div>
      {fm ? (
        <>
          <h4>Frontmatter</h4>
          <dl className="kv">
            {Object.entries(fm).map(([k, v]) => (
              <Row key={k} k={k} v={v} />
            ))}
          </dl>
        </>
      ) : null}
      <h4>Details</h4>
      <dl className="kv">
        <Row k="kind" v={node.kind} />
        <Row k="scope" v={node.scope} />
        <Row k="layer" v={node.layer} />
        <Row k="loads" v={node.loadTiming} />
        <Row k="flags" v={node.flags} />
        {entries.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </dl>
      {effective ? (
        <>
          <h4>Effective settings here</h4>
          <dl className="kv">
            {effective.model ? <Row k="model" v={`${effective.model.value} (from ${effective.model.level})`} /> : null}
            <Row k="allow" v={effective.permissions.allow.map((p) => `${p.value} [${p.level}]`)} />
            <Row k="deny" v={effective.permissions.deny.map((p) => `${p.value} [${p.level}]`)} />
            <Row k="ask" v={effective.permissions.ask.map((p) => `${p.value} [${p.level}]`)} />
            <Row k="env" v={Object.entries(effective.env).map(([k, p]) => `${k}=${p.value} [${p.level}]`)} />
            <Row k="plugins" v={Object.entries(effective.enabledPlugins).map(([k, p]) => `${k}: ${p.value ? 'on' : 'off'} [${p.level}]`)} />
          </dl>
        </>
      ) : null}
    </div>
  )
}

export function RelationshipsTab({ node, indexes }: { node: Node; indexes: Indexes }) {
  const reveal = useAppStore((s) => s.revealNode)
  const parent = node.parentId ? indexes.byId.get(node.parentId) : undefined
  const children = indexes.childrenOf.get(node.id) ?? []
  const outgoing = indexes.edgesBySource.get(node.id) ?? []
  const incoming = indexes.edgesByTarget.get(node.id) ?? []
  const group = (edges: Edge[], dir: 'out' | 'in') => {
    const byKind = new Map<EdgeKind, Edge[]>()
    for (const e of edges) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e])
    return Array.from(byKind.entries()).map(([kind, list]) => (
      <div key={`${dir}-${kind}`}>
        <h4>
          {dir === 'out' ? EDGE_GLOSSARY[kind] : `is ${EDGE_GLOSSARY[kind]} by`} ({list.length})
        </h4>
        {list.slice(0, 60).map((e) => {
          const otherId = dir === 'out' ? e.target : e.source
          const other = indexes.byId.get(otherId)
          if (!other) return null
          return (
            <button key={e.id} type="button" className="rel" onClick={() => reveal(other.id)}>
              <span className="swatch" style={{ ['--k' as string]: `var(--k-${KIND_FAMILY[other.kind]})` } as React.CSSProperties} />
              <span>{other.label}</span>
              <span className="rel__kind">{GLOSSARY[other.kind].title}</span>
            </button>
          )
        })}
        {list.length > 60 ? <p className="notice">…and {list.length - 60} more</p> : null}
      </div>
    ))
  }
  const childKinds = new Map<string, number>()
  for (const c of children) {
    const k = indexes.byId.get(c)?.kind ?? 'unknown'
    childKinds.set(k, (childKinds.get(k) ?? 0) + 1)
  }
  return (
    <div>
      {parent && parent.kind !== 'machine' ? (
        <>
          <h4>Lives in</h4>
          <button type="button" className="rel" onClick={() => reveal(parent.id)}>
            <span className="swatch" style={{ ['--k' as string]: `var(--k-${KIND_FAMILY[parent.kind]})` } as React.CSSProperties} />
            <span>{parent.label}</span>
            <span className="rel__kind">{GLOSSARY[parent.kind].title}</span>
          </button>
        </>
      ) : null}
      {children.length > 0 ? (
        <>
          <h4>Contains</h4>
          <div className="chips">
            {Array.from(childKinds.entries()).map(([k, n]) => (
              <span key={k} className="chip">
                {n} {k}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {group(outgoing, 'out')}
      {group(incoming, 'in')}
      {outgoing.length + incoming.length === 0 && children.length === 0 ? <p className="notice">No links beyond its container.</p> : null}
    </div>
  )
}

export function LearnTab({ node }: { node: Node }) {
  const g = GLOSSARY[node.kind]
  const invocation = (node.data as { invocation?: string }).invocation
  return (
    <div className="learn">
      <h4>{g.title}</h4>
      <p>{g.what}</p>
      <h4>When it loads</h4>
      <p>{g.loads}</p>
      <h4>Where it lives</h4>
      <p>
        <code>{g.lives}</code>
      </p>
      {invocation ? (
        <>
          <h4>How to invoke</h4>
          <p>
            <code>{invocation}</code>
          </p>
        </>
      ) : null}
      <p>
        <a href={docsUrl(g.docs)} target="_blank" rel="noopener noreferrer">
          Read the Claude Code docs <Icon name="external" style={{ width: 12, height: 12, verticalAlign: '-1px' }} />
        </a>
      </p>
    </div>
  )
}
