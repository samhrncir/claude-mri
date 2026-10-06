import type { NodeKind } from '../../shared/kinds.js'

export interface Size {
  width: number
  height: number
}

export const CARD: Size = { width: 220, height: 64 }
export const GRID_ITEM: Size = { width: 200, height: 48 }
export const PILL: Size = { width: 150, height: 32 }
export const RULE: Size = { width: 230, height: 36 }
export const SMALL: Size = { width: 200, height: 40 }
export const COLLAPSED: Size = { width: 260, height: 88 }
export const CONTAINER_PADDING = { top: 56, side: 16, bottom: 16 }

export function leafSize(kind: NodeKind): Size {
  switch (kind) {
    case 'skill':
    case 'command':
    case 'agent':
    case 'hook':
      return GRID_ITEM
    case 'tool':
    case 'hookEvent':
    case 'unknownMcpServer':
      return PILL
    case 'permissionRule':
      return RULE
    case 'memoryFile':
    case 'session':
    case 'liveSession':
    case 'logFile':
    case 'stateDir':
    case 'credentials':
    case 'pluginData':
      return SMALL
    default:
      return CARD
  }
}

export function nodeTypeFor(kind: NodeKind): 'card' | 'pill' {
  return kind === 'tool' || kind === 'permissionRule' || kind === 'hookEvent' || kind === 'unknownMcpServer' ? 'pill' : 'card'
}
