import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { EDGE_STYLE } from '../../graph/edges.js'
import { useAppStore } from '../../store/index.js'
import type { GraphEdge } from '../../store/types.js'

export const KindEdge = memo(function KindEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<GraphEdge>) {
  const dimmed = useAppStore((s) => (s.highlight ? !s.highlight.edgeIds.has(id) : false))
  const lit = useAppStore((s) => (s.highlight ? s.highlight.edgeIds.has(id) : false))
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 })
  if (!data) return null
  const style = { ['--edge-color' as string]: `var(--k-${data.family})` } as CSSProperties
  const showLabel = lit || data.kind === 'aggregated' || EDGE_STYLE[data.baseKind].labelAtNear
  return (
    <g className={`edge edge--${data.stroke} ${data.animated ? 'edge--animated' : ''} ${dimmed ? 'is-dimmed' : ''} ${lit ? 'edge--lit' : ''}`} style={style}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={16} />
      {showLabel && data.label ? (
        <EdgeLabelRenderer>
          <div className={`edge-label ${lit ? 'edge-label--hover' : ''} ${dimmed ? 'is-dimmed' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
})

export const EDGE_TYPES = { kind: KindEdge } as const
