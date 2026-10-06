// Per-viewer conveniences in localStorage (positions, expansion, viewport). Every access is guarded.

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

export function layoutKey(platform: string, homeDir: string): string {
  return `claude-mri:v1:${fnv1a(`${platform}|${homeDir}`)}`
}

export interface PersistedLayout {
  positions: Record<string, { x: number; y: number }>
  expanded: Record<string, boolean>
  viewport?: { x: number; y: number; zoom: number }
}

export function loadPersisted(key: string): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      expanded: parsed.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : {},
      viewport: parsed.viewport && typeof parsed.viewport.zoom === 'number' ? parsed.viewport : undefined,
    }
  } catch {
    return null
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

export function savePersisted(key: string, value: PersistedLayout): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage unavailable; positions simply do not persist
    }
  }, 300)
}

export function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null && (allowed as readonly string[]).includes(raw)) return raw as T
  } catch {
    // ignore
  }
  return fallback
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}
