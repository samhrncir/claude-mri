import { useCallback, useEffect, useState } from 'react'
import { readSetting, writeSetting } from '../lib/persist.js'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const THEME_KEY = 'claude-mri.theme'

/** 'system' follows prefers-color-scheme (pure CSS); 'light' / 'dark' pin <html data-theme>. index.html applies it before paint. */
export function useTheme(): [Theme, (next: Theme) => void, 'light' | 'dark'] {
  const [theme, setThemeState] = useState<Theme>(() => readSetting(THEME_KEY, THEMES, 'system'))
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setResolved(theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeSetting(THEME_KEY, next)
  }, [])

  return [theme, setTheme, resolved]
}
