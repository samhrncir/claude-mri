import { describe, expect, it } from 'vitest'
import { DOCS_BASE, EDGE_GLOSSARY, GLOSSARY, LAYER_GLOSSARY, docsUrl } from '../../src/shared/glossary.js'
import { EDGE_KINDS, LAYERS, NODE_KINDS } from '../../src/shared/kinds.js'

describe('glossary', () => {
  it('explains every node kind with a docs link', () => {
    for (const kind of NODE_KINDS) {
      const g = GLOSSARY[kind]
      expect(g, kind).toBeDefined()
      expect(g.title.length, kind).toBeGreaterThan(2)
      expect(g.what.length, kind).toBeGreaterThan(30)
      expect(docsUrl(g.docs).startsWith(DOCS_BASE), kind).toBe(true)
      expect(g.docs).not.toMatch(/^https?:/)
    }
  })

  it('names every edge kind and layer', () => {
    for (const kind of EDGE_KINDS) expect(EDGE_GLOSSARY[kind], kind).toBeTruthy()
    for (const layer of LAYERS) expect(LAYER_GLOSSARY[layer].title, layer).toBeTruthy()
  })
})
