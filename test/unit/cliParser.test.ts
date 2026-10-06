import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePluginDetails, parseTok } from '../../src/server/enrich/claudeCli.js'

const sample = readFileSync(new URL('../fixtures/cli/plugin-details-ecc.txt', import.meta.url), 'utf8')

describe('claude plugin details parser', () => {
  it('parses header, inventory, always-on cost and the component table', () => {
    const d = parsePluginDetails(sample)
    expect(d.name).toBe('ecc')
    expect(d.version).toBe('2.2.3')
    expect(d.source).toBe('ecc@ecc')
    expect(d.description?.startsWith('Harness-native')).toBe(true)
    expect(d.inventory.Skills?.count).toBe(387)
    expect(d.inventory.Skills?.names).toContain('tdd-workflow')
    expect(d.inventory.Hooks).toEqual({ count: 7, names: ['PreToolUse', 'PreCompact', 'SessionStart', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd'] })
    expect(d.inventory['MCP servers']).toEqual({ count: 1, names: ['chrome-devtools'] })
    expect(d.inventory['LSP servers']).toEqual({ count: 0, names: [] })
    expect(d.tokensAlwaysOn).toBe(44834)
    expect(d.parsedRows).toBe(9)
    expect(d.components[0]).toEqual({ name: 'accessibility', alwaysOn: 130, onInvoke: 2400 })
    expect(d.components.find((c) => c.name === 'tdd-workflow')).toEqual({ name: 'tdd-workflow', alwaysOn: 200, onInvoke: 4000 })
    expect(d.components.filter((c) => c.name === 'ecc-guide')).toHaveLength(2)
  })

  it('tolerates format drift and ANSI codes', () => {
    const drifted = parsePluginDetails('\u001b[1mfoo 1.0.0\u001b[0m\n  Widgets (3)  a, b, c\nSomething else entirely\n')
    expect(drifted.name).toBe('foo')
    expect(drifted.inventory).toEqual({})
    expect(drifted.parsedRows).toBe(0)
    expect(drifted.tokensAlwaysOn).toBeUndefined()
  })

  it('parses token shorthand', () => {
    expect(parseTok('~2.4k')).toBe(2400)
    expect(parseTok('~130')).toBe(130)
    expect(parseTok('44,834')).toBe(44834)
    expect(parseTok('1.2m')).toBe(1200000)
    expect(parseTok('—')).toBeUndefined()
  })
})
