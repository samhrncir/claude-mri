import { useReactFlow } from '@xyflow/react'
import { useAppStore } from '../../store/index.js'
import { Icon } from '../Icon.js'

export interface ToolbarProps {
  resolvedTheme: 'light' | 'dark'
  onCycleTheme(): void
}

export function Toolbar({ resolvedTheme, onCycleTheme }: ToolbarProps) {
  const rf = useReactFlow()
  const scrollMode = useAppStore((s) => s.scrollMode)
  const setScrollMode = useAppStore((s) => s.setScrollMode)
  const resetLayout = useAppStore((s) => s.resetLayout)
  const expandAll = useAppStore((s) => s.expandAll)
  const collapseAll = useAppStore((s) => s.collapseAll)
  const legendOpen = useAppStore((s) => s.legendOpen)
  const setLegendOpen = useAppStore((s) => s.setLegendOpen)
  const startTour = useAppStore((s) => s.startTour)
  const tour = useAppStore((s) => s.tour)
  const layoutStatus = useAppStore((s) => s.layoutStatus)
  return (
    <div className="toolbar" role="toolbar" aria-label="Canvas tools">
      <button type="button" className="btn" onClick={() => void rf.fitView({ padding: 0.08, duration: 400 })} title="Fit everything (F)">
        <Icon name="fit" /> Fit
      </button>
      <button type="button" className="btn" onClick={() => void rf.zoomTo(1, { duration: 250 })} title="Zoom to 100% (2)">
        100%
      </button>
      <span className="toolbar__sep" />
      <button type="button" className="btn" onClick={expandAll} title="Expand every group">
        <Icon name="expand" /> Expand all
      </button>
      <button type="button" className="btn" onClick={collapseAll} title="Collapse the top-level groups">
        <Icon name="collapse" /> Collapse all
      </button>
      <button type="button" className="btn" onClick={resetLayout} title="Forget dragged positions and relayout">
        <Icon name="reset" /> Reset layout
      </button>
      <span className="toolbar__sep" />
      <button type="button" className="btn" aria-pressed={scrollMode === 'pan'} onClick={() => setScrollMode(scrollMode === 'zoom' ? 'pan' : 'zoom')} title="Mouse wheel zooms (default) or pans like a trackpad; Ctrl+wheel always zooms">
        Wheel: {scrollMode === 'zoom' ? 'zoom' : 'pan'}
      </button>
      <button type="button" className="btn" aria-pressed={legendOpen} onClick={() => setLegendOpen(!legendOpen)} title="Legend (L)">
        <Icon name="legend" /> Legend
      </button>
      <button type="button" className={`btn ${tour ? '' : 'btn--primary'}`} onClick={startTour} title="Guided tour for newcomers">
        <Icon name="tour" /> Tour
      </button>
      <button type="button" className="btn btn--ghost" onClick={onCycleTheme} title="Theme (T)" aria-label="Toggle theme">
        <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />
      </button>
      {layoutStatus === 'fallback' ? <span className="chip" title="The ELK layout engine was unavailable; a simpler grid layout is shown">simple layout</span> : null}
    </div>
  )
}
