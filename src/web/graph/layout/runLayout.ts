// Runs ELK in a web worker with a timeout, falling back to the synchronous packer. Applies pinned positions.
import ELK from 'elkjs/lib/elk-api.js'
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker'
import type { GraphEdge, GraphNode, LaneBox } from '../../store/types.js'
import { fallbackLayout } from './fallback.js'
import { fromElk, toElk, type Placed } from './toElk.js'

export type LayoutEngine = 'elk' | 'fallback'

export interface LayoutResult {
  nodes: GraphNode[]
  lanes: LaneBox[]
  engine: LayoutEngine
}

let elk: InstanceType<typeof ELK> | null = null

function getElk(): InstanceType<typeof ELK> {
  if (!elk) elk = new ELK({ workerFactory: () => new ElkWorker() })
  return elk
}

export const LANE_TITLES: Record<number, { title: string; caption: string }> = {
  0: { title: 'Organization', caption: 'Enforced by your organization; cannot be overridden' },
  1: { title: 'You', caption: 'Loaded at startup for every project' },
  2: { title: 'Projects', caption: 'Only when you run Claude in that folder' },
  3: { title: 'Extensions', caption: 'Installed once, enabled in settings' },
  4: { title: 'Tools and events', caption: 'What Claude is allowed to do, and when hooks fire' },
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`layout timed out after ${ms} ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

function apply(nodes: readonly GraphNode[], placed: Map<string, Placed>, pins: Record<string, { x: number; y: number }>): GraphNode[] {
  return nodes.map((n) => {
    const p = placed.get(n.id)
    const pin = pins[n.id]
    const position = pin ?? (p ? { x: p.x, y: p.y } : n.position)
    if (n.type === 'container' && p) return { ...n, position, width: p.width, height: p.height, style: { width: p.width, height: p.height } }
    return { ...n, position }
  })
}

function lanesFor(nodes: readonly GraphNode[]): LaneBox[] {
  const byPartition = new Map<number, GraphNode[]>()
  for (const n of nodes) if (!n.parentId) byPartition.set(n.data.partition, [...(byPartition.get(n.data.partition) ?? []), n])
  const lanes: LaneBox[] = []
  for (const [partition, group] of byPartition) {
    const xs = group.map((g) => g.position.x)
    const rights = group.map((g) => g.position.x + (g.width ?? 220))
    const ys = group.map((g) => g.position.y)
    const meta = LANE_TITLES[partition] ?? { title: `Lane ${partition}`, caption: '' }
    lanes.push({ partition, title: meta.title, caption: meta.caption, x: Math.min(...xs), y: Math.min(...ys) - 64, width: Math.max(...rights) - Math.min(...xs) })
  }
  return lanes.sort((a, b) => a.partition - b.partition)
}

export async function runLayout(nodes: readonly GraphNode[], edges: readonly GraphEdge[], pins: Record<string, { x: number; y: number }>, opts: { timeoutMs?: number; forceFallback?: boolean } = {}): Promise<LayoutResult> {
  if (nodes.length === 0) return { nodes: [], lanes: [], engine: 'fallback' }
  if (!opts.forceFallback && typeof Worker !== 'undefined') {
    try {
      const result = await withTimeout(getElk().layout(toElk(nodes, edges)), opts.timeoutMs ?? 6000)
      const placed = fromElk(result)
      const out = apply(nodes, placed, pins)
      return { nodes: out, lanes: lanesFor(out), engine: 'elk' }
    } catch (err) {
      console.warn('[claude-mri] ELK layout failed, using fallback:', err)
    }
  }
  const placed = fallbackLayout(nodes, edges)
  const out = apply(nodes, placed, pins)
  return { nodes: out, lanes: lanesFor(out), engine: 'fallback' }
}
