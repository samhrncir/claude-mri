import { EDGE_FAMILY, IMPLIED_EDGE_KINDS, type EdgeKind, type Family } from '../../shared/kinds.js'

export interface EdgeStyle {
  stroke: 'solid' | 'dashed' | 'dotted'
  animated: boolean
  labelAtNear: boolean
  /** Only drawn when this layer is visible. */
  layerOnly?: 'sessions' | 'state'
}

const BASE: EdgeStyle = { stroke: 'solid', animated: false, labelAtNear: false }

export const EDGE_STYLE: Record<EdgeKind, EdgeStyle> = {
  contains: BASE,
  provides: BASE,
  loadsAtStartup: { stroke: 'dotted', animated: false, labelAtNear: false },
  loadsLazily: { stroke: 'dotted', animated: false, labelAtNear: false },
  imports: { stroke: 'solid', animated: false, labelAtNear: true },
  overrides: { stroke: 'solid', animated: false, labelAtNear: true },
  enables: { stroke: 'solid', animated: false, labelAtNear: false },
  disables: { stroke: 'dashed', animated: false, labelAtNear: true },
  configures: { stroke: 'dotted', animated: false, labelAtNear: false },
  triggers: { stroke: 'dotted', animated: false, labelAtNear: false },
  matches: { stroke: 'solid', animated: false, labelAtNear: true },
  allows: { stroke: 'solid', animated: false, labelAtNear: false },
  denies: { stroke: 'dashed', animated: false, labelAtNear: false },
  asks: { stroke: 'dashed', animated: false, labelAtNear: false },
  approves: { stroke: 'dotted', animated: false, labelAtNear: false },
  rejects: { stroke: 'dashed', animated: false, labelAtNear: false },
  surfacesAs: { stroke: 'solid', animated: false, labelAtNear: false },
  installedFrom: { stroke: 'dotted', animated: false, labelAtNear: false },
  references: { stroke: 'dotted', animated: false, labelAtNear: false },
  recordsUsage: { stroke: 'dotted', animated: false, labelAtNear: false, layerOnly: 'state' },
  remembers: BASE,
  runsIn: { stroke: 'solid', animated: true, labelAtNear: false, layerOnly: 'sessions' },
  writes: { stroke: 'dotted', animated: false, labelAtNear: false, layerOnly: 'sessions' },
  holds: { stroke: 'dotted', animated: false, labelAtNear: false, layerOnly: 'sessions' },
  nestedIn: { stroke: 'dotted', animated: false, labelAtNear: false },
  sameProjectAs: BASE,
}

/** Edge kinds drawn as lines; the rest are expressed by nesting or by the loadTiming dot. */
export function isDrawn(kind: EdgeKind): boolean {
  return !(IMPLIED_EDGE_KINDS as readonly string[]).includes(kind)
}

export function edgeFamily(kind: EdgeKind): Family {
  return EDGE_FAMILY[kind]
}

const FALLBACK: Record<Family, string> = {
  instructions: '#b7791f',
  settings: '#2f6fdc',
  hooks: '#7c3aed',
  mcp: '#0f9488',
  plugins: '#15803d',
  skills: '#4f46e5',
  memory: '#be3a7c',
  sessions: '#6b7482',
  cloud: '#0284c7',
  scope: '#64748b',
  state: '#8b95a3',
}

/** Resolves a family colour from the CSS tokens; falls back to fixed hues when no DOM is available. */
export function familyColor(family: Family): string {
  if (typeof document === 'undefined') return FALLBACK[family]
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--k-${family}`).trim()
  return value === '' ? FALLBACK[family] : value
}
