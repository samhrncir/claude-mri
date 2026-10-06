import { describe, expect, it } from 'vitest'
import { jsonErrorPosition } from '../../src/server/scan/fsx.js'
import { parseJsonc, stripJsonComments } from '../../src/server/scan/jsonSafe.js'

describe('jsonc fallback', () => {
  it('strips comments and trailing commas but not inside strings', () => {
    const text = `{\n  // comment\n  "url": "http://x/y", /* c */\n  "a": [1, 2,],\n}`
    expect(parseJsonc(text)).toEqual({ ok: true, value: { url: 'http://x/y', a: [1, 2] } })
    expect(stripJsonComments('{"s": "a//b"}')).toBe('{"s": "a//b"}')
    expect(parseJsonc('{nope').ok).toBe(false)
  })

  it('derives line and column from the shapes V8 uses in JSON.parse errors', () => {
    const raw = '{\n  "a": 1,\n  "b": }'
    expect(jsonErrorPosition('Unexpected token } in JSON at position 17', raw)).toEqual({ line: 3, column: 6 })
    expect(jsonErrorPosition("Expected property name or '}' in JSON at position 1 (line 1 column 2)", raw)).toEqual({ line: 1, column: 2 })
    expect(jsonErrorPosition(`Unexpected token '}', "{...}" is not valid JSON`, raw)).toEqual({})
  })
})
