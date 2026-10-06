import { describe, expect, it } from 'vitest'
import { encodeProjectDir, idPathOf, isUnder, joinPath, normalizePath, pathKey, relativeTo, scopePath, stripUncPrefix } from '../../src/server/scan/paths.js'

const win = { home: 'C:/Users/Sam', configDir: 'C:/Users/Sam/.claude', platform: 'win32' as const }
const nix = { home: '/home/sam', configDir: '/home/sam/.claude', platform: 'linux' as const }

describe('normalizePath', () => {
  it('converts backslashes, trailing slashes and drive case on win32', () => {
    expect(normalizePath('c:\\Users\\Sam\\ai-coding\\', 'win32')).toBe('C:/Users/Sam/ai-coding')
    expect(normalizePath('C:/Users//Sam/./x/../y', 'win32')).toBe('C:/Users/Sam/y')
    expect(normalizePath('C:\\', 'win32')).toBe('C:/')
  })
  it('keeps UNC and strips long-path prefixes', () => {
    expect(normalizePath('\\\\server\\share\\dir', 'win32')).toBe('//server/share/dir')
    expect(stripUncPrefix('\\\\?\\C:\\x')).toBe('C:\\x')
    expect(normalizePath('//?/C:/x/', 'win32')).toBe('C:/x')
  })
  it('is case-preserving on linux', () => {
    expect(normalizePath('/Home/Sam/', 'linux')).toBe('/Home/Sam')
    expect(pathKey('/Home/Sam', 'linux')).toBe('/Home/Sam')
    expect(pathKey('C:/Users/SAM', 'win32')).toBe('c:/users/sam')
  })
})

describe('isUnder / relativeTo / joinPath', () => {
  it('respects path boundaries', () => {
    expect(isUnder('C:/Users/Sam/.claude/x', 'C:/Users/Sam/.claude', 'win32')).toBe(true)
    expect(isUnder('C:/Users/Sam/.claude2', 'C:/Users/Sam/.claude', 'win32')).toBe(false)
    expect(relativeTo('C:/Users/Sam', 'c:/users/sam/ai-coding/webtop', 'win32')).toBe('ai-coding/webtop')
    expect(relativeTo('/home/sam', '/etc', 'linux')).toBeNull()
    expect(joinPath('C:/Users/Sam', '.claude', 'plugins/')).toBe('C:/Users/Sam/.claude/plugins')
  })
})

describe('scopePath / idPathOf', () => {
  it('uses ~ for home and $cfg for an external config dir', () => {
    expect(scopePath('C:/Users/Sam/.claude/settings.json', win)).toBe('~/.claude/settings.json')
    expect(scopePath('C:/Users/Sam/ai-coding/Webtop', win)).toBe('~/ai-coding/Webtop')
    expect(idPathOf('C:/Users/Sam/ai-coding/Webtop', win)).toBe('~/ai-coding/webtop')
    expect(scopePath('D:/other/CLAUDE.md', win)).toBe('D:/other/CLAUDE.md')
    const ext = { ...nix, configDir: '/srv/claude-cfg' }
    expect(scopePath('/srv/claude-cfg/settings.json', ext)).toBe('$cfg/settings.json')
    expect(scopePath('/home/sam/CLAUDE.md', nix)).toBe('~/CLAUDE.md')
  })
})

describe('encodeProjectDir', () => {
  it('matches the observed ~/.claude/projects encoding', () => {
    expect(encodeProjectDir('C:/Users/Sam/ai-coding/email-services/email-platform')).toBe('C--Users-Sam-ai-coding-email-services-email-platform')
    expect(encodeProjectDir('C:\\Users\\Sam\\ai-coding\\07092026')).toBe('C--Users-Sam-ai-coding-07092026')
    expect(encodeProjectDir('/home/sam/dev')).toBe('-home-sam-dev')
  })
})
