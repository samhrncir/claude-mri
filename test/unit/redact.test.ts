import { describe, expect, it } from 'vitest'
import { REDACTED, isSecretKey, redactArgs, redactMap, redactSecretsDeep, redactTokenShapes, redactUrl, tildeify } from '../../src/server/redact.js'

describe('redact', () => {
  it('matches secret-looking keys but not ordinary ones', () => {
    for (const k of ['GITHUB_TOKEN', 'api_key', 'apiKey', 'Authorization', 'client-secret', 'password', 'key']) expect(isSecretKey(k)).toBe(true)
    for (const k of ['PATH', 'MODEL', 'hook_profile', 'keyboard', 'monkey']) expect(isSecretKey(k)).toBe(false)
  })

  it('redacts env values but keeps keys and placeholders', () => {
    const r = redactMap({ GITHUB_TOKEN: 'ghp_abc', API_KEY: '${MY_KEY}', DEBUG: '1' })
    expect(r.values).toEqual({ GITHUB_TOKEN: REDACTED, API_KEY: '${MY_KEY}', DEBUG: '1' })
    expect(r.redactedKeys).toEqual(['GITHUB_TOKEN'])
    expect(r.placeholders).toEqual(['${MY_KEY}'])
  })

  it('redacts flag values and key=value args', () => {
    const r = redactArgs(['-y', 'server', '--token', 'abc123', '--api-key=xyz', 'PASSWORD=hunter2', '--port', '3000'])
    expect(r.args).toEqual(['-y', 'server', '--token', REDACTED, `--api-key=${REDACTED}`, `PASSWORD=${REDACTED}`, '--port', '3000'])
    expect(r.redactedKeys).toEqual(['token', 'api-key', 'PASSWORD'])
  })

  it('strips well-known token shapes and URL secrets', () => {
    expect(redactTokenShapes('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 end')).toBe(`key ${REDACTED} end`)
    expect(redactUrl('https://user:pw@example.com/mcp?token=abc&x=1')).toBe(`https://example.com/mcp?token=${encodeURIComponent(REDACTED)}&x=${encodeURIComponent(REDACTED)}`)
    const deep = redactSecretsDeep({ a: { secret: 'shh', ok: 'fine' }, list: [`ghp_${'a'.repeat(36)}`], args: ['--token', 'abc'] }) as {
      a: { secret: string; ok: string }
      list: string[]
      args: string[]
    }
    expect(deep.a.secret).toBe(REDACTED)
    expect(deep.a.ok).toBe('fine')
    expect(deep.list[0]).toBe(REDACTED)
    expect(deep.args).toEqual(['--token', REDACTED])
  })

  it('tilde-fies every spelling of the home dir', () => {
    const home = 'C:/Users/Sam'
    const input = 'C:\\Users\\Sam\\.claude and C:/users/sam/x and C:\\\\Users\\\\Sam\\\\y'
    expect(tildeify(input, home, 'win32')).toBe('~\\.claude and ~/x and ~\\\\y')
    expect(tildeify('/home/sam/.claude', '/home/sam', 'linux')).toBe('~/.claude')
    expect(tildeify('/home/samuel/.claude', '/home/sam', 'linux')).toBe('~uel/.claude')
  })
})
