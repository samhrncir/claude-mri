import { ViewportPortal } from '@xyflow/react'
import { useAppStore } from '../../store/index.js'

export function LaneHeaders() {
  const lanes = useAppStore((s) => s.lanes)
  if (lanes.length === 0) return null
  return (
    <ViewportPortal>
      {lanes.map((lane) => (
        <div key={lane.partition} className="lane" style={{ transform: `translate(${lane.x}px, ${lane.y}px)`, width: Math.max(lane.width, 260) }}>
          <div className="lane__title">{lane.title}</div>
          <div className="lane__caption">{lane.caption}</div>
        </div>
      ))}
    </ViewportPortal>
  )
}
