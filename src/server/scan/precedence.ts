// Settings precedence: `overrides` edges between adjacent levels and a merged "effective" view with provenance.
import { SETTINGS_LEVEL_RANK } from '../../shared/kinds.js'
import type { EffectiveView, Node, Prov } from '../../shared/snapshot.js'
import type { ScanContext } from './context.js'

function rankOf(s: Node<'settings'>): number {
  return SETTINGS_LEVEL_RANK[s.data.level]
}

/** Settings files that apply when Claude runs in `ownerId` (a project, worktree or the user scope), lowest precedence first. */
export function settingsChainFor(ctx: ScanContext, ownerId: string): Node<'settings'>[] {
  const all = ctx.b.byKind('settings')
  const managed = all.filter((s) => s.data.level === 'managed')
  const user = all.filter((s) => s.parentId === ctx.ids.userScope)
  const own = ownerId === ctx.ids.userScope ? [] : all.filter((s) => s.parentId === ownerId)
  return [...user, ...own, ...managed].sort((a, b) => rankOf(a) - rankOf(b) || a.id.localeCompare(b.id))
}

export function computeEffective(ctx: ScanContext, chain: Node<'settings'>[]): EffectiveView {
  const view: EffectiveView = { permissions: { allow: [], deny: [], ask: [] }, hooks: {}, env: {}, enabledPlugins: {} }
  for (const s of chain) {
    const level = s.data.level
    const prov = <T>(value: T): Prov<T> => ({ value, from: s.id, level })
    for (const child of ctx.b.childrenOf(s.id)) {
      if (child.kind === 'permissionRule') {
        const rule = child as Node<'permissionRule'>
        view.permissions[rule.data.list].push(prov(rule.data.raw))
      } else if (child.kind === 'hookGroup') {
        const group = child as Node<'hookGroup'>
        const entry = view.hooks[group.data.event] ?? { groups: 0, from: [] }
        entry.groups += 1
        if (!entry.from.includes(s.id)) entry.from.push(s.id)
        view.hooks[group.data.event] = entry
      }
    }
    if (s.data.permissions?.defaultMode) view.permissions.defaultMode = prov(s.data.permissions.defaultMode)
    for (const [k, v] of Object.entries(s.data.env ?? {})) view.env[k] = prov(v)
    if (s.data.model) view.model = prov(s.data.model)
    if (s.data.effortLevel) view.effortLevel = prov(s.data.effortLevel)
    if (s.data.outputStyle) view.outputStyle = prov(s.data.outputStyle)
    if (s.data.disableAllHooks !== undefined) view.disableAllHooks = prov(s.data.disableAllHooks)
    for (const [id, enabled] of Object.entries(s.data.enabledPlugins ?? {})) view.enabledPlugins[id] = prov(enabled)
  }
  return view
}

/** For every project, worktree and the user scope: overrides edges (high -> next lower present level) and data.effective. */
export function linkPrecedence(ctx: ScanContext): void {
  const owners: Node[] = [...ctx.b.byKind('project'), ...ctx.b.byKind('worktree')]
  const userScope = ctx.b.get(ctx.ids.userScope)
  if (userScope) owners.push(userScope)
  for (const owner of owners) {
    const chain = settingsChainFor(ctx, owner.id)
    const descending = [...chain].reverse()
    for (let i = 0; i + 1 < descending.length; i += 1) {
      const higher = descending[i]
      const lower = descending[i + 1]
      if (!higher || !lower || rankOf(higher) === rankOf(lower)) continue
      ctx.b.edge({ kind: 'overrides', source: higher.id, target: lower.id, label: 'overrides', data: { reason: `${higher.data.level} settings win over ${lower.data.level} settings for the same key` } })
    }
    const effective = computeEffective(ctx, chain)
    if (owner.kind === 'project') (owner as Node<'project'>).data.effective = effective
    else (owner.data as Record<string, unknown>).effective = effective
  }
}
