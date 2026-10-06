// "Why is this here?" sentences built from a node's incident edges and its parent.
import { EDGE_GLOSSARY, GLOSSARY } from '../../shared/glossary.js'
import type { EdgeKind } from '../../shared/kinds.js'
import type { Edge, Node } from '../../shared/snapshot.js'
import type { Indexes } from '../store/types.js'

const PRIORITY: EdgeKind[] = ['provides', 'enables', 'disables', 'installedFrom', 'imports', 'overrides', 'allows', 'denies', 'asks', 'matches', 'triggers', 'approves', 'rejects', 'surfacesAs', 'references', 'nestedIn', 'runsIn', 'holds', 'recordsUsage']

function label(indexes: Indexes, id: string): string {
  return indexes.byId.get(id)?.label ?? id
}

export function whyIsThisHere(node: Node, indexes: Indexes): string[] {
  const out: string[] = []
  const parent = node.parentId ? indexes.byId.get(node.parentId) : undefined
  if (parent && parent.kind !== 'machine') {
    out.push(`${GLOSSARY[node.kind].title} "${node.label}" lives in ${GLOSSARY[parent.kind].title.toLowerCase()} "${parent.label}".`)
  }
  const invocation = (node.data as { invocation?: string }).invocation
  if (invocation) {
    const userOnly = (node.data as { disableModelInvocation?: boolean }).disableModelInvocation
    out.push(userOnly ? `Only you can run it, as ${invocation}.` : `You can run it as ${invocation}; Claude may also pick it when its description matches the task.`)
  }
  switch (node.loadTiming) {
    case 'startup':
      out.push(node.kind === 'skill' || node.kind === 'agent' || node.kind === 'command' ? 'Its name and description are in context in every session here; the full text loads only when it is used.' : 'It is read at the start of every session it applies to.')
      break
    case 'lazy':
      out.push('Nothing is loaded until Claude actually needs it, so it costs no context until then.')
      break
    case 'onEvent':
      out.push('It only runs when its event fires.')
      break
    case 'never':
      out.push('Claude Code does not load this into a session; it is data about past or current sessions.')
      break
    default:
      break
  }
  const incident: Edge[] = [...(indexes.edgesBySource.get(node.id) ?? []), ...(indexes.edgesByTarget.get(node.id) ?? [])]
  const seen = new Set<string>()
  for (const kind of PRIORITY) {
    for (const e of incident) {
      if (e.kind !== kind || seen.has(e.id)) continue
      seen.add(e.id)
      const outgoing = e.source === node.id
      const other = label(indexes, outgoing ? e.target : e.source)
      out.push(sentence(kind, node.label, other, outgoing, e))
      if (out.length >= 5) return out
    }
  }
  return out
}

function sentence(kind: EdgeKind, self: string, other: string, outgoing: boolean, e: Edge): string {
  const verb = EDGE_GLOSSARY[kind]
  switch (kind) {
    case 'provides':
      return outgoing ? `"${self}" provides "${other}".` : `It is provided by "${other}".`
    case 'enables':
      return outgoing ? `"${self}" enables "${other}" (${e.data?.key ?? 'enabledPlugins'}).` : `It is enabled by "${other}" through ${e.data?.key ?? 'enabledPlugins'}.`
    case 'disables':
      return outgoing ? `"${self}" disables "${other}".` : `It is disabled by "${other}", so nothing from it loads.`
    case 'installedFrom':
      return outgoing ? `It was installed from marketplace "${other}".` : `Plugin "${other}" was installed from here.`
    case 'imports':
      return outgoing ? `It imports "${other}" with ${e.label ?? '@path'}, so that file is read as if it were part of it.` : `It is imported by "${other}" with ${e.label ?? '@path'} and read together with it at launch.`
    case 'overrides':
      return outgoing ? `Keys set here take precedence over the same keys in "${other}"; list keys such as permissions.allow are merged instead.` : `Keys in "${other}" take precedence over this file when both set the same key.`
    case 'allows':
      return outgoing ? `This rule lets Claude use "${other}" without asking.` : `Rule "${other}" allows this without asking.`
    case 'denies':
      return outgoing ? `This rule blocks "${other}". Deny rules win over allow rules at every scope.` : `Rule "${other}" blocks this; deny beats allow at every scope.`
    case 'asks':
      return outgoing ? `This rule makes Claude ask before using "${other}".` : `Rule "${other}" makes Claude ask before using this.`
    case 'matches':
      return outgoing ? `This hook runs when the tool name matches ${e.data?.matcher ? `"${e.data.matcher}"` : 'any tool'}, which includes "${other}".` : `Hook "${other}" runs when this tool is used.`
    case 'triggers':
      return outgoing ? `This event triggers matcher group "${other}".` : `It is triggered by the ${other} event.`
    case 'approves':
      return outgoing ? `This project approved .mcp.json server "${other}"; the approval is stored in ~/.claude.json.` : `It was approved for this project in ~/.claude.json.`
    case 'rejects':
      return outgoing ? `This project rejected .mcp.json server "${other}".` : `It was rejected for this project, so it never connects here.`
    case 'surfacesAs':
      return outgoing ? `Its tools appear to Claude as ${other}; rules and matchers refer to them that way.` : `This is how server "${other}" appears to Claude.`
    case 'references':
      return outgoing ? `It references "${other}" in its frontmatter.` : `It is referenced by "${other}".`
    case 'nestedIn':
      return outgoing ? `This folder sits inside project "${other}", whose CLAUDE.md files load here too.` : `Project "${other}" is a subfolder of this one.`
    case 'runsIn':
      return outgoing ? `This process is running in "${other}".` : `A Claude Code process is running here right now.`
    case 'holds':
      return outgoing ? `This running session is using plugin "${other}".` : `A running session is using this plugin version.`
    case 'recordsUsage':
      return outgoing ? `Usage of "${other}" is counted here.` : `~/.claude.json counts how often this is used.`
    default:
      return outgoing ? `"${self}" ${verb} "${other}".` : `"${other}" ${verb} "${self}".`
  }
}
