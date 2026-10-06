import { FAMILIES, type Family } from '../../shared/kinds.js'
import { useAppStore } from '../store/index.js'
import { Icon } from './Icon.js'

const FAMILY_TEXT: Record<Family, string> = {
  instructions: 'Instructions (CLAUDE.md, rules, styles)',
  settings: 'Settings and permission rules',
  hooks: 'Hooks and their events',
  mcp: 'MCP servers and tools',
  plugins: 'Plugins and marketplaces',
  skills: 'Skills, commands, agents',
  memory: 'Memory and plans',
  sessions: 'Sessions and logs',
  cloud: 'claude.ai and Desktop',
  scope: 'Scopes and projects',
  state: 'Runtime state',
}

export function Legend() {
  const close = useAppStore((s) => s.setLegendOpen)
  return (
    <aside className="legend" aria-label="Legend">
      <h4>
        Colours{' '}
        <button type="button" className="btn btn--tiny btn--ghost" style={{ float: 'right' }} onClick={() => close(false)} aria-label="Close legend">
          <Icon name="close" />
        </button>
      </h4>
      {FAMILIES.map((f) => (
        <div key={f} className="legend__row">
          <span className="swatch" style={{ ['--k' as string]: `var(--k-${f})` } as React.CSSProperties} />
          <span>{FAMILY_TEXT[f]}</span>
        </div>
      ))}
      <h4>When it loads</h4>
      <div className="legend__row">
        <span className="timing timing--startup" /> at startup, every session
      </div>
      <div className="legend__row">
        <span className="timing timing--lazy" /> on demand or when invoked
      </div>
      <div className="legend__row">
        <span className="timing timing--onEvent" /> runs when its event fires
      </div>
      <div className="legend__row">
        <span className="timing timing--never" /> data about sessions, not loaded
      </div>
      <h4>Lines</h4>
      <div className="legend__row">
        <span className="legend__line" /> enables, allows, imports, appears as
      </div>
      <div className="legend__row">
        <span className="legend__line legend__line--dashed" /> denies, disables, rejects
      </div>
      <div className="legend__row">
        <span className="legend__line legend__line--dotted" /> configures, triggers, installed from
      </div>
      <div className="legend__row">
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Nesting means "lives inside"; those links are not drawn.</span>
      </div>
    </aside>
  )
}
