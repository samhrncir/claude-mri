import { useEffect } from 'react'
import { useAppStore } from '../store/index.js'

export interface KeyboardActions {
  fitView(): void
  zoomTo(zoom: number): void
  cycleTheme(): void
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useKeyboard(actions: KeyboardActions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAppStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setSearchOpen(true)
        return
      }
      if (isTyping(e.target)) return
      if (e.key === 'Escape') {
        if (s.searchOpen) s.setSearchOpen(false)
        else if (s.tour) s.endTour()
        else if (s.focus) s.setFocus(null)
        else if (s.selectedId) s.select(null)
        return
      }
      if (s.tour) {
        if (e.key === 'ArrowRight') s.tourStep(1)
        if (e.key === 'ArrowLeft') s.tourStep(-1)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case '/':
          e.preventDefault()
          s.setSearchOpen(true)
          break
        case 'f':
        case 'F':
          actions.fitView()
          break
        case '1':
          actions.zoomTo(0.35)
          break
        case '2':
          actions.zoomTo(1)
          break
        case '3':
          actions.zoomTo(1.6)
          break
        case 'e':
        case 'E':
          if (s.selectedId) s.toggleExpanded(s.selectedId)
          break
        case 't':
        case 'T':
          actions.cycleTheme()
          break
        case 'l':
        case 'L':
          s.setLegendOpen(!s.legendOpen)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])
}
