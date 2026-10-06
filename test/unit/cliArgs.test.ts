import { describe, expect, it } from 'vitest'
import { CliUsageError, parseCliArgs } from '../../src/server/cliArgs.js'

describe('parseCliArgs', () => {
  it('applies defaults', () => {
    const o = parseCliArgs([])
    expect(o.open).toBe(true)
    expect(o.cli).toBe(true)
    expect(o.watch).toBe(true)
    expect(o.depth).toBe(3)
    expect(o.roots).toEqual([])
    expect(o.port).toBeUndefined()
  })

  it('parses negated booleans and repeated roots', () => {
    const o = parseCliArgs(['--no-open', '--no-cli', '--root', 'C:/a', '--root', '/b', '--port', '5000', '--depth', '1'])
    expect(o.open).toBe(false)
    expect(o.cli).toBe(false)
    expect(o.roots).toEqual(['C:/a', '/b'])
    expect(o.port).toBe(5000)
    expect(o.depth).toBe(1)
  })

  it('rejects unknown flags and bad numbers', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(CliUsageError)
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow(CliUsageError)
    expect(() => parseCliArgs(['--port', '70000'])).toThrow(CliUsageError)
  })
})
