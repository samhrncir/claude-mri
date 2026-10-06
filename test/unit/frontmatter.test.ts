import { describe, expect, it } from 'vitest'
import { asStringList, parseFrontmatter } from '../../src/server/scan/frontmatter.js'

describe('parseFrontmatter', () => {
  it('parses scalars, quoted strings, inline lists and nested maps', () => {
    const fm = parseFrontmatter(`---
name: tdd-workflow
description: "Test-driven development workflow: write tests first"
model: sonnet
tools: Read, Write, Edit
allowed-tools: [Bash(git *), Read]
disable-model-invocation: true
metadata:
  origin: ECC
  version: 2
---
# Body
text`)
    expect(fm.hasFrontmatter).toBe(true)
    expect(fm.data.name).toBe('tdd-workflow')
    expect(fm.data.description).toBe('Test-driven development workflow: write tests first')
    expect(fm.data['allowed-tools']).toEqual(['Bash(git *)', 'Read'])
    expect(fm.data['disable-model-invocation']).toBe(true)
    expect(fm.data.metadata).toEqual({ origin: 'ECC', version: 2 })
    expect(fm.body.startsWith('# Body')).toBe(true)
    expect(asStringList(fm.data.tools)).toEqual(['Read', 'Write', 'Edit'])
  })

  it('parses block lists and folded scalars', () => {
    const fm = parseFrontmatter(`---
paths:
  - "src/api/**/*.ts"
  - tests/**
description: >
  A long description
  on two lines.
---
body`)
    expect(fm.data.paths).toEqual(['src/api/**/*.ts', 'tests/**'])
    expect(fm.data.description).toBe('A long description on two lines.')
  })

  it('handles files without frontmatter and unterminated fences', () => {
    expect(parseFrontmatter('# Just markdown').hasFrontmatter).toBe(false)
    const bad = parseFrontmatter('---\nname: x\nno end')
    expect(bad.hasFrontmatter).toBe(false)
    expect(bad.errors).toContain('unterminated frontmatter')
  })
})
