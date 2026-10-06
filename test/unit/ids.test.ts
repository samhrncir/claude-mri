import { describe, expect, it } from 'vitest'
import { idOf, machineId, parseId } from '../../src/shared/ids.js'

describe('ids', () => {
  it('round-trips kind, path and fragment', () => {
    const id = idOf('permissionRule', '~/.claude/settings.json', 'allow/Bash(git *)')
    expect(id).toBe('permissionRule:~/.claude/settings.json#allow/Bash(git *)')
    expect(parseId(id)).toEqual({ kind: 'permissionRule', scopedPath: '~/.claude/settings.json', fragment: 'allow/Bash(git *)' })
  })

  it('escapes # inside paths', () => {
    const id = idOf('claudeMd', '~/dev/c#/CLAUDE.md')
    expect(parseId(id)).toEqual({ kind: 'claudeMd', scopedPath: '~/dev/c#/CLAUDE.md' })
  })

  it('builds machine singletons', () => {
    expect(machineId('hookEvent', 'PreToolUse')).toBe('hookEvent:machine#PreToolUse')
  })
})
