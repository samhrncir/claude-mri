import { useCallback, useEffect } from 'react'
import { Canvas } from './components/Canvas/Canvas.js'
import { Filters } from './components/Filters.js'
import { Inspector } from './components/Inspector/Inspector.js'
import { Search } from './components/Search.js'
import { DropZone, EmptyState, Header } from './components/Shell.js'
import { Toasts } from './components/Toast.js'
import { useBootstrap } from './hooks/useBootstrap.js'
import { THEMES, useTheme } from './hooks/useTheme.js'
import { useAppStore } from './store/index.js'
import { startPipeline } from './store/pipeline.js'

export function App() {
  useBootstrap()
  const status = useAppStore((s) => s.status)
  const railOpen = useAppStore((s) => s.railOpen)
  const setRailOpen = useAppStore((s) => s.setRailOpen)
  const [theme, setTheme, resolved] = useTheme()

  useEffect(() => {
    // Handy for support: inspect state from the browser console with __claudeMri.getState().
    ;(window as unknown as { __claudeMri?: typeof useAppStore }).__claudeMri = useAppStore
    return startPipeline()
  }, [])

  const cycleTheme = useCallback(() => {
    const i = THEMES.indexOf(theme)
    setTheme(THEMES[(i + 1) % THEMES.length] ?? 'system')
  }, [theme, setTheme])

  return (
    <DropZone>
      <div className="shell">
        <Header onToggleRail={() => setRailOpen(!railOpen)} />
        {status === 'ready' ? (
          <>
            <Filters />
            <Canvas resolvedTheme={resolved} onCycleTheme={cycleTheme} />
            <Inspector />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
      <Search />
      <Toasts />
    </DropZone>
  )
}
