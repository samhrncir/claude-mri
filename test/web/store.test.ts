import { beforeEach, describe, expect, it } from 'vitest'
import type { Snapshot } from '../../src/shared/snapshot.js'
import { useAppStore } from '../../src/web/store/index.js'
import demo from '../../src/web/demo/demo-snapshot.json'

const snapshot = demo as unknown as Snapshot

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('store', () => {
  it('loads a snapshot and builds indexes', () => {
    useAppStore.getState().loadSnapshot(snapshot, 'demo')
    const s = useAppStore.getState()
    expect(s.status).toBe('ready')
    expect(s.mode).toBe('demo')
    expect(s.indexes?.byId.size).toBe(snapshot.nodes.length)
    expect(s.indexes?.topLevel.length).toBeGreaterThan(2)
    expect(s.pendingFit).toBe(true)
  })

  it('toggles layers and never leaves zero layers on', () => {
    const s = useAppStore.getState()
    s.toggleLayer('memory')
    expect(useAppStore.getState().filters.layers.has('memory')).toBe(true)
    s.toggleLayer('memory')
    s.toggleLayer('config')
    expect(useAppStore.getState().filters.layers.has('config')).toBe(true)
  })

  it('reveals a node by expanding its ancestors', () => {
    useAppStore.getState().loadSnapshot(snapshot, 'demo')
    const skill = snapshot.nodes.find((n) => n.kind === 'skill' && n.parentId?.startsWith('plugin:'))
    expect(skill).toBeDefined()
    useAppStore.getState().revealNode(skill!.id)
    const s = useAppStore.getState()
    expect(s.selectedId).toBe(skill!.id)
    expect(s.flyTo).toBe(skill!.id)
    expect(s.expanded[skill!.parentId!]).toBe(true)
    expect(s.expanded[`ui:section:${skill!.parentId}:skill`]).toBe(true)
  })

  it('queues toasts with actions', () => {
    useAppStore.getState().toast('hello', { label: 'Do', run: () => undefined })
    expect(useAppStore.getState().toasts).toHaveLength(1)
    useAppStore.getState().dismissToast(useAppStore.getState().toasts[0]!.id)
    expect(useAppStore.getState().toasts).toHaveLength(0)
  })
})
