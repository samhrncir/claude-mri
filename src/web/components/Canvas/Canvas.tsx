// The React Flow canvas: infinite dotted background, pan/zoom, drag, minimap, panels and semantic zoom.
import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, SelectionMode, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { familyColor } from '../../graph/edges.js'
import { useKeyboard } from '../../hooks/useKeyboard.js'
import { useAppStore } from '../../store/index.js'
import type { GraphEdge, GraphNode } from '../../store/types.js'
import { EDGE_TYPES } from '../edges/index.js'
import { Legend } from '../Legend.js'
import { NODE_TYPES } from '../nodes/index.js'
import { Tour } from '../Tour.js'
import { FocusPill } from './FocusPill.js'
import { LaneHeaders } from './LaneHeaders.js'
import { Toolbar } from './Toolbar.js'
import { ZoomClass } from './ZoomClass.js'

export interface CanvasProps {
  resolvedTheme: 'light' | 'dark'
  onCycleTheme(): void
}

/** Bounding box of the top-level nodes (children live inside their parents). */
export function graphBounds(nodes: readonly GraphNode[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.parentId) continue
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + (n.width ?? 220))
    maxY = Math.max(maxY, n.position.y + (n.height ?? 64))
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

/** Absolute canvas position of a node (positions of nested nodes are relative to their parent). */
export function absolutePosition(node: GraphNode, nodes: readonly GraphNode[]): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  let guard = 0
  while (parentId && guard < 50) {
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
    guard += 1
  }
  return { x, y }
}

export function Canvas({ resolvedTheme, onCycleTheme }: CanvasProps) {
  const wrapper = useRef<HTMLDivElement | null>(null)
  const rf = useReactFlow<GraphNode, GraphEdge>()
  const nodes = useAppStore((s) => s.rfNodes)
  const edges = useAppStore((s) => s.rfEdges)
  const onNodesChange = useAppStore((s) => s.onNodesChange)
  const scrollMode = useAppStore((s) => s.scrollMode)
  const layoutStatus = useAppStore((s) => s.layoutStatus)
  const pendingFit = useAppStore((s) => s.pendingFit)
  const consumeFit = useAppStore((s) => s.consumeFit)
  const flyTo = useAppStore((s) => s.flyTo)
  const consumeFly = useAppStore((s) => s.consumeFly)
  const select = useAppStore((s) => s.select)
  const hover = useAppStore((s) => s.hover)
  const pin = useAppStore((s) => s.pin)
  const tour = useAppStore((s) => s.tour)
  const legendOpen = useAppStore((s) => s.legendOpen)

  // Nodes outside the viewport are never rendered or measured (onlyRenderVisibleElements), so frame the graph from
  // the layout geometry we already know instead of relying on React Flow's measurement-based fitView.
  // Both calls are pure viewport math, so they run synchronously; a deferred call would be cancelled by the next
  // render when React Flow reports node measurements.
  useEffect(() => {
    if (!pendingFit || layoutStatus === 'running' || nodes.length === 0) return
    const bounds = graphBounds(nodes)
    consumeFit()
    if (bounds) void rf.fitBounds(bounds, { padding: 0.08, duration: 400 })
  }, [pendingFit, layoutStatus, nodes, rf, consumeFit])

  useEffect(() => {
    if (!flyTo || layoutStatus === 'running') return
    const target = nodes.find((n) => n.id === flyTo)
    if (!target) return
    consumeFly()
    const abs = absolutePosition(target, nodes)
    const w = target.width ?? 220
    const h = target.height ?? 64
    void rf.setCenter(abs.x + w / 2, abs.y + h / 2, { zoom: target.type === 'container' ? 0.6 : 1.1, duration: 500 })
  }, [flyTo, layoutStatus, nodes, rf, consumeFly])

  const actions = useMemo(
    () => ({
      fitView: () => void rf.fitView({ padding: 0.08, duration: 400 }),
      zoomTo: (zoom: number) => void rf.zoomTo(zoom, { duration: 250 }),
      cycleTheme: onCycleTheme,
    }),
    [rf, onCycleTheme],
  )
  useKeyboard(actions)

  const onNodeClick = useCallback((_e: React.MouseEvent, node: GraphNode) => select(node.id), [select])
  const onNodeMouseEnter = useCallback((_e: React.MouseEvent, node: GraphNode) => hover(node.id), [hover])
  const onNodeMouseLeave = useCallback(() => hover(null), [hover])
  const onNodeDragStop = useCallback((_e: MouseEvent | TouchEvent, node: GraphNode) => pin(node.id, node.position), [pin])
  const onPaneClick = useCallback(() => select(null), [select])
  const minimapColor = useCallback((n: GraphNode) => familyColor(n.data.family), [])

  return (
    <div className="canvas rf" ref={wrapper} data-zoom="mid">
      <ReactFlow<GraphNode, GraphEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodesConnectable={false}
        edgesReconnectable={false}
        edgesFocusable={false}
        nodesFocusable
        elevateNodesOnSelect
        deleteKeyCode={null}
        panOnDrag={[0, 1]}
        panActivationKeyCode="Space"
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        zoomOnScroll={scrollMode === 'zoom'}
        panOnScroll={scrollMode === 'pan'}
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.08}
        maxZoom={2.5}
        onlyRenderVisibleElements
        colorMode={resolvedTheme}
        proOptions={{ hideAttribution: true }}
      >
        <ZoomClass wrapper={wrapper} />
        <Background id="dots" variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dot)" />
        <MiniMap<GraphNode> pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={0} maskColor="var(--canvas-mask)" position="bottom-right" />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-center">
          <Toolbar resolvedTheme={resolvedTheme} onCycleTheme={onCycleTheme} />
        </Panel>
        <Panel position="bottom-center">{tour ? <Tour /> : <FocusPill />}</Panel>
        <LaneHeaders />
      </ReactFlow>
      {layoutStatus === 'running' ? <div className="layout-status">Laying out…</div> : null}
      {legendOpen ? <Legend /> : null}
    </div>
  )
}
