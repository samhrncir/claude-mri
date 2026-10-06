// Synchronous layout used when ELK is unavailable, times out, or the snapshot is huge:
// grid-pack every container bottom-up, then stack top-level containers in lane columns.
import type { GraphEdge, GraphNode } from '../../store/types.js'
import { CONTAINER_PADDING } from '../sizes.js'
import type { Placed } from './toElk.js'

export interface PackItem {
  id: string
  width: number
  height: number
}

export interface Packed {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

/** Deterministic row-major grid: items keep their order, columns chosen for a wide-ish aspect. */
export function gridPack(items: readonly PackItem[], gap = 14, padding = CONTAINER_PADDING): Packed {
  const positions = new Map<string, { x: number; y: number }>()
  if (items.length === 0) return { positions, width: 260, height: padding.top + padding.bottom }
  const cols = Math.max(1, Math.min(items.length, Math.ceil(Math.sqrt(items.length * 1.8))))
  const colWidth = Math.max(...items.map((i) => i.width))
  let x = padding.side
  let y = padding.top
  let rowHeight = 0
  let col = 0
  let maxX = 0
  for (const item of items) {
    positions.set(item.id, { x, y })
    rowHeight = Math.max(rowHeight, item.height)
    maxX = Math.max(maxX, x + item.width)
    col += 1
    if (col >= cols) {
      col = 0
      x = padding.side
      y += rowHeight + gap
      rowHeight = 0
    } else {
      x += colWidth + gap
    }
  }
  const height = col === 0 ? y - gap + padding.bottom : y + rowHeight + padding.bottom
  return { positions, width: maxX + padding.side, height }
}

const LANE_GAP = 140
const STACK_GAP = 56

export function fallbackLayout(nodes: readonly GraphNode[], _edges: readonly GraphEdge[]): Map<string, Placed> {
  const byParent = new Map<string | undefined, GraphNode[]>()
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n])
  const placed = new Map<string, Placed>()

  const size = (n: GraphNode): { width: number; height: number } => {
    const kids = byParent.get(n.id) ?? []
    if (n.type !== 'container' || kids.length === 0) return { width: n.width ?? 220, height: n.height ?? 64 }
    const items = kids.map((k) => ({ id: k.id, ...size(k) }))
    const packed = gridPack(items)
    for (const k of kids) {
      const p = packed.positions.get(k.id) ?? { x: 0, y: 0 }
      const s = items.find((i) => i.id === k.id) ?? { width: 0, height: 0 }
      placed.set(k.id, { x: p.x, y: p.y, width: s.width, height: s.height })
    }
    return { width: Math.max(packed.width, 320), height: packed.height }
  }

  const lanes = new Map<number, GraphNode[]>()
  for (const n of byParent.get(undefined) ?? []) lanes.set(n.data.partition, [...(lanes.get(n.data.partition) ?? []), n])
  let laneX = 0
  for (const partition of Array.from(lanes.keys()).sort((a, b) => a - b)) {
    let y = 0
    let laneWidth = 0
    for (const n of lanes.get(partition) ?? []) {
      const s = size(n)
      placed.set(n.id, { x: laneX, y, width: s.width, height: s.height })
      y += s.height + STACK_GAP
      laneWidth = Math.max(laneWidth, s.width)
    }
    laneX += laneWidth + LANE_GAP
  }
  return placed
}
