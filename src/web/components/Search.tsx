import { useMemo, useState } from 'react'
import { GLOSSARY } from '../../shared/glossary.js'
import { KIND_FAMILY, type NodeKind } from '../../shared/kinds.js'
import { searchItems, type Searchable } from '../lib/fuzzy.js'
import { shortPath } from '../lib/format.js'
import { useAppStore } from '../store/index.js'

interface Item extends Searchable {
  kind: NodeKind
}

export function Search() {
  const open = useAppStore((s) => s.searchOpen)
  if (!open) return null
  return <SearchDialog />
}

/** Mounted only while open, so query and cursor state reset naturally. */
function SearchDialog() {
  const setOpen = useAppStore((s) => s.setSearchOpen)
  const snapshot = useAppStore((s) => s.snapshot)
  const reveal = useAppStore((s) => s.revealNode)
  const setFocus = useAppStore((s) => s.setFocus)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const items = useMemo<Item[]>(
    () => (snapshot ? snapshot.nodes.filter((n) => n.kind !== 'machine').map((n) => ({ id: n.id, kind: n.kind, label: n.label, invocation: (n.data as { invocation?: string }).invocation, path: n.path, summary: n.summary })) : []),
    [snapshot],
  )
  const hits = useMemo(() => searchItems(query, items, 40), [query, items])
  const rows = useMemo(() => hits.map((h, i) => ({ hit: h, header: i === 0 || hits[i - 1]?.item.kind !== h.item.kind })), [hits])

  const go = (id: string, focus = false) => {
    setOpen(false)
    reveal(id)
    if (focus) setTimeout(() => setFocus(id, 1), 400)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(hits.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      const hit = hits[cursor]
      if (hit) go(hit.item.id, e.shiftKey)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div className="search" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="search__input"
          placeholder="Search skills, files, servers, rules…  (Enter: go, Shift+Enter: focus)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={onKey}
          aria-label="Search"
        />
        <div className="search__list" role="listbox">
          {query.trim() === '' ? <div className="search__empty">Type to search {items.length} items.</div> : null}
          {query.trim() !== '' && hits.length === 0 ? <div className="search__empty">No matches.</div> : null}
          {rows.map(({ hit, header }, i) => (
            <div key={hit.item.id}>
              {header ? <div className="search__group">{GLOSSARY[hit.item.kind].title}</div> : null}
              <button type="button" className="search__item" role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => go(hit.item.id)}>
                <span className="swatch" style={{ ['--k' as string]: `var(--k-${KIND_FAMILY[hit.item.kind]})` } as React.CSSProperties} />
                <span>{hit.item.label}</span>
                {hit.item.invocation ? <code>{hit.item.invocation}</code> : null}
                <span className="path">{shortPath(hit.item.path, 48)}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
