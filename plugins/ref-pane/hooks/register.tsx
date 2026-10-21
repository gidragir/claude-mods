import type { Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { RefItem } from '../types'
import type { FsLike } from './refs'
import { findIds, gistOf, HOME, parsePrefixes, resolveRefs, rootsIn, shortPath } from './refs'

const PANE = 'refs'
const items = atom({ plugin: 'ref-pane', key: 'items' } as const, [])
const selected = atom({ plugin: 'ref-pane', key: 'selected' } as const, null)
// features directories named by path in the session; kept in $.state to survive hot reload
const roots = atom({ plugin: 'ref-pane', key: 'roots' } as const, [])
const MAX_ROOTS = 10
const SUMMARY_ROWS = 12 // entries with a short summary in the overview; the rest are buttons below
// what the last search did: shown in the empty pane if no references were found or the search failed
const status = atom({ plugin: 'ref-pane', key: 'status' } as const, '')

type Host = Parameters<typeof update>[0]
const fsOf = ($: { fs: { list: FsLike['list']; read: (path: string) => Promise<string> } }): FsLike => ({
  list: p => $.fs.list(p),
  read: p => $.fs.read(p),
})

const learn = async ($: Host, text: string) => {
  const seen = rootsIn(text)
  if (seen.length > 0) await update($, roots, list => [...seen, ...list.filter(r => !seen.includes(r))].slice(0, MAX_ROOTS))
}

export const register: Register = (on, options) => {
  // User-defined prefixes (the prefixes option); an empty or broken value falls back to the default set.
  const custom = parsePrefixes(String(options.prefixes ?? ''))
  const prefixes = Object.keys(custom).length > 0 ? custom : HOME
  // Passive hooks: on any error pass the event on so as not to silence other plugins in the chain.
  on('prompt.submit', async ($, e, next) => {
    await learn($, e.text)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ref',
      description: 'Show an artifact section by reference: /ref RV-1 (no argument: open the pane)',
    })
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await learn($, e.answer)
    const ids = findIds(e.answer)
    if (e.agentId === undefined && ids.length > 0) {
      // The search runs inside the hook: $ is valid only until the hook returns. The amount of work is bounded
      // (known prefixes, listing cache), and any error goes to status instead of being swallowed.
      const cwd = await $.session.cwd().catch(() => undefined)
      try {
        const known = await read($, roots)
        const found = await resolveRefs(fsOf($), cwd, ids, e.answer, known, prefixes)
        await update($, status, () => `${ids.join(', ')} → found ${found.length}; cwd: ${cwd ?? '?'}; roots: ${known.length}`)
        if (found.length > 0) {
          const before = await read($, items)
          await update($, items, list => {
            const keep = list.filter(x => !found.some(f => f.id === x.id))
            return [...found, ...keep].slice(0, 30)
          })
          // leave the user's selection alone; open the pane only if new references appeared
          if (found.some(f => !before.some(x => x.id === f.id))) void $.ui.open({ id: PANE, title: 'Refs' })
        }
      } catch (err) {
        await update($, status, () => `search error: ${err instanceof Error ? err.message : String(err)}`).catch(() => undefined)
      }
    }
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('command.run', { command: 'ref' }, async ($, e) => {
    const ids = findIds(e.args)
    if (ids.length > 0) {
      await learn($, e.args)
      const known = await read($, roots)
      const found = await resolveRefs(fsOf($), await $.session.cwd().catch(() => undefined), ids, e.args, known, prefixes)
      if (found.length === 0) return { text: `Not found: ${ids.join(', ')}. Searched in: ${[...known, 'cwd/features'].join(', ')}` }
      await update($, items, list => [...found, ...list.filter(x => !found.some(f => f.id === x.id))].slice(0, 30))
      await update($, selected, () => found[0]!.id)
    }
    await $.ui.open({ id: PANE, title: 'Refs', focus: true })
    return { text: 'Refs pane opened.' }
  }).catch((_$, e, next) => (next.called ? next(e) : { text: 'Failed to handle /ref.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = await read($, items)
    const sel = await read($, selected)
    if (list.length === 0) {
      const last = await read($, status)
      return (
        <Box flexDirection="column">
          <Text dimColor>No references yet. They will appear from the model's answer or via /ref RV-1.</Text>
          {last !== '' && <Text dimColor>Last search: {last}</Text>}
        </Box>
      )
    }
    const cur: RefItem | undefined = list.find(x => x.id === sel)
    if (cur === undefined) {
      return (
        <Box flexDirection="column">
          {list.slice(0, SUMMARY_ROWS).map(x => {
            const g = gistOf(x.text)
            return (
              <Box key={`row-${x.id}`} flexDirection="column">
                <Button key={x.id} onPress={() => update($, selected, () => x.id)}>
                  {x.id} <Text dimColor>{g.head}</Text>
                </Button>
                <Text dimColor>{g.gist}</Text>
              </Box>
            )
          })}
          {list.length > SUMMARY_ROWS && (
            <Box flexWrap="wrap">
              {list.slice(SUMMARY_ROWS).map(x => (
                <Button key={x.id} onPress={() => update($, selected, () => x.id)}>
                  {x.id}
                </Button>
              ))}
            </Box>
          )}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap">
          <Button key="back" onPress={() => update($, selected, () => null)}>
            ← Overview
          </Button>
          {list.map(x => (
            <Button key={x.id} variant={x.id === cur.id ? 'primary' : 'secondary'} onPress={() => update($, selected, () => x.id)}>
              {x.id}
            </Button>
          ))}
        </Box>
        <Text dimColor>
          {shortPath(cur.file)}:{String(cur.line)}
        </Text>
        <Markdown key="body" text={cur.text} />
      </Box>
    )
  })
}
