import type { SVGProps } from 'react'
import type { Family } from '../../shared/kinds.js'

export type IconName = Family | 'search' | 'fit' | 'reset' | 'expand' | 'collapse' | 'sun' | 'moon' | 'tour' | 'legend' | 'close' | 'external' | 'warning' | 'rescan' | 'export' | 'filter' | 'logo' | 'folder' | 'copy'

// Mono-line icons built from horizontal and vertical segments (same style as the user's other apps).
const paths: Record<IconName, string> = {
  instructions: 'M5 2h10v4h4v16H5zM15 2v4h4M8 11h8M8 14h8M8 17h5',
  settings: 'M3 6h18M3 12h18M3 18h18M8 4v4M15 10v4M10 16v4',
  hooks: 'M4 4h6v6H4zM14 14h6v6h-6zM10 7h4v7',
  mcp: 'M2 9h20v6H2zM6 9V5h12v4M6 15v4h12v-4',
  plugins: 'M4 8h6V4h4v4h6v5h-4v4h4v3H4z',
  skills: 'M12 2v4M12 18v4M2 12h4M18 12h4M8 8h8v8H8z',
  memory: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  sessions: 'M2 4h20v16H2zM6 9h3v3H6M12 15h6',
  cloud: 'M4 10h16v8H4zM8 10V6h8v4',
  scope: 'M2 5h7v2h13v13H2zM6 12h12M6 16h8',
  state: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  search: 'M4 4h10v10H4zM14 14l6 6',
  fit: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  reset: 'M4 4h16v16H4zM8 12h8M12 8v8',
  expand: 'M12 5v14M5 12h14',
  collapse: 'M5 12h14',
  sun: 'M8 8h8v8H8zM12 2v3M12 19v3M2 12h3M19 12h3',
  moon: 'M14 3h-4v4H6v4h4v4h4v4h4v-4h-4v-4h4V7h-4z',
  tour: 'M4 20V4h12l4 4-4 4H4M8 20h8',
  legend: 'M3 5h4v4H3zM10 7h11M3 14h4v4H3zM10 16h11',
  close: 'M6 6l12 12M18 6L6 18',
  external: 'M18 13v6H5V6h6M13 3h8v8M17 3v4h4',
  warning: 'M12 3v12M12 18v3M4 21h16L12 3',
  rescan: 'M4 4v6h6M20 20v-6h-6M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4',
  export: 'M12 3v12M8 11l4 4 4-4M4 17v4h16v-4',
  filter: 'M3 5h18M6 12h12M10 19h4',
  logo: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  folder: 'M2 5h7v2h13v13H2z',
  copy: 'M8 8h12v12H8zM4 16V4h12',
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}

export function Icon({ name, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" {...rest}>
      <path d={paths[name]} />
    </svg>
  )
}
