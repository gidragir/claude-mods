import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { RefItem } from '../types'
import type { FsLike } from './refs'
import { docDirs, extractSection, findIds, gistOf, HOME, parsePrefixes, resolveRefs, rootsIn, shortPath } from './refs'
import { truncate } from './ui'

const PANE = 'refs'
const items = atom({ plugin: 'ref-pane', key: 'items' } as const, [])
const selected = atom({ plugin: 'ref-pane', key: 'selected' } as const, null)
// features directories named by path in the session; kept in $.state to survive hot reload
const roots = atom({ plugin: 'ref-pane', key: 'roots' } as const, [])
const MAX_ROOTS = 10
// what the last search did: shown in the empty pane if no references were found or the search failed
const status = atom({ plugin: 'ref-pane', key: 'status' } as const, '')
const searchQuery = atom({ plugin: 'ref-pane', key: 'searchQuery' } as const, '')
const configPrefixes = atom({ plugin: 'ref-pane', key: 'configPrefixes' } as const, '')

type Host = EngineInterface
const fsOf = ($: { fs: { list: FsLike['list']; read: (path: string) => Promise<string> } }): FsLike => ({
  list: p => $.fs.list(p),
  read: p => $.fs.read(p),
})

const learn = async ($: Host, text: string) => {
  const seen = rootsIn(text)
  if (seen.length > 0)
    await update($, roots, list => [...seen, ...list.filter(r => !seen.includes(r))].slice(0, MAX_ROOTS)).catch(() => undefined)
}

export const discoverRefs = async (
  fs: FsLike,
  cwd: string | undefined,
  known: string[],
  prefixes: Record<string, string>,
  limit = 30,
): Promise<RefItem[]> => {
  const out: RefItem[] = []
  const seen = new Set<string>()

  // 1. Scan docs directories near cwd and from known roots
  const docsDirs = Array.from(new Set([...docDirs(cwd), ...known.filter(r => r.endsWith('/docs'))]))
  for (const dir of docsDirs) {
    const entries = await fs.list(dir).catch(() => [])
    const mdFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.md') && !/_humanized|_presentation/.test(e.name))
    for (const e of mdFiles) {
      const file = `${dir}/${e.name}`
      const content = await fs.read(file).catch(() => '')
      if (!content) continue
      for (const id of findIds(content, prefixes)) {
        if (!seen.has(id)) {
          const sec = extractSection(content, id)
          if (sec) {
            seen.add(id)
            out.push({ id, file, line: sec.line, text: sec.text })
            if (out.length >= limit) return out
          }
        }
      }
    }
  }

  // 2. Scan features roots (capped at top 10 most recent tickets)
  const cwdFeatures = cwd ? [`${cwd.replaceAll('\\', '/')}/features`] : []
  const featRoots = Array.from(new Set([...known.filter(r => !r.endsWith('/docs')), ...cwdFeatures]))
  const dirNames = new Set(Object.values(prefixes))

  for (const root of featRoots) {
    const entries = await fs.list(root).catch(() => [])
    const ticketEntries = entries
      .filter(e => e.kind === 'dir')
      .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
      .slice(0, 10)

    for (const ticket of ticketEntries) {
      const ticketPath = `${root}/${ticket.name}`
      const children = await fs.list(ticketPath).catch(() => [])

      // Direct markdown files in ticket directory
      const directMd = children.filter(e => e.kind === 'file' && e.name.endsWith('.md') && !/_humanized|_presentation/.test(e.name))
      for (const e of directMd) {
        const file = `${ticketPath}/${e.name}`
        const content = await fs.read(file).catch(() => '')
        if (!content) continue
        for (const id of findIds(content, prefixes)) {
          if (!seen.has(id)) {
            const sec = extractSection(content, id)
            if (sec) {
              seen.add(id)
              out.push({ id, file, line: sec.line, text: sec.text })
              if (out.length >= limit) return out
            }
          }
        }
      }

      // Subdirectories matching configured prefix dirs
      const subDirs = children.filter(e => e.kind === 'dir' && dirNames.has(e.name))
      for (const sub of subDirs) {
        const subPath = `${ticketPath}/${sub.name}`
        const subEntries = await fs.list(subPath).catch(() => [])
        const subMd = subEntries.filter(e => e.kind === 'file' && e.name.endsWith('.md') && !/_humanized|_presentation/.test(e.name))
        for (const e of subMd) {
          const file = `${subPath}/${e.name}`
          const content = await fs.read(file).catch(() => '')
          if (!content) continue
          for (const id of findIds(content, prefixes)) {
            if (!seen.has(id)) {
              const sec = extractSection(content, id)
              if (sec) {
                seen.add(id)
                out.push({ id, file, line: sec.line, text: sec.text })
                if (out.length >= limit) return out
              }
            }
          }
        }
      }
    }
  }

  return out
}

export const discoverIds = async (
  fs: FsLike,
  cwd: string | undefined,
  known: string[],
  prefixes: Record<string, string>,
): Promise<string[]> => {
  const refs = await discoverRefs(fs, cwd, known, prefixes)
  return refs.map(r => r.id)
}

const getPrefixes = async ($: Host, fallback?: string): Promise<Record<string, string>> => {
  let raw: string | undefined

  try {
    const stored = await read($, configPrefixes)
    if (stored && typeof stored === 'string' && stored.trim() !== '') {
      raw = stored.trim()
    }
  } catch {}

  if (raw === undefined && typeof fallback === 'string' && fallback.trim() !== '') {
    raw = fallback.trim()
  }

  if (raw !== undefined) {
    const custom = parsePrefixes(raw)
    if (Object.keys(custom).length > 0) return custom
  }

  return HOME
}

const addToChat = async ($: Host, item: RefItem) => {
  let quote = item.text
  let isSelection = false
  try {
    const sel = await $.ui.selection()
    if (sel?.text && sel.text.trim() !== '') {
      quote = sel.text.trim()
      isSelection = true
    }
  } catch {}
  if (!quote || quote.trim() === '') return

  const path = shortPath(item.file)
  const pathPart = path ? ` (${path}:${String(item.line)})` : ''
  const lines = quote
    .split('\n')
    .map(l => `> ${l}`)
    .join('\n')
  const formatted = `\n> **[${item.id}]**${pathPart}:\n${lines}\n\n`
  try {
    await $.prompt.fill({ text: formatted, mode: 'append' })
  } catch {}
  try {
    $.ui.toast(isSelection ? `Added selected text from [${item.id}] to chat` : `Added [${item.id}] context to chat prompt`)
  } catch {}
}

export const register: Register = (on, options) => {
  const fallbackPrefixes = typeof options.prefixes === 'string' ? options.prefixes : undefined

  // Update configPrefixes and discover references whenever /config sets the prefix
  on('config.set', async ($, e, next) => {
    const res = await next(e)
    if (e.key === 'ref-pane.prefixes' || e.key === 'prefixes' || e.key.endsWith('.prefixes')) {
      if (typeof e.value === 'string') {
        await update($, configPrefixes, () => e.value).catch(() => undefined)
        const custom = parsePrefixes(e.value)
        const prefixes = Object.keys(custom).length > 0 ? custom : HOME
        const cwd = await $.session.cwd().catch(() => undefined)
        const known = await read($, roots).catch(() => [])
        const found = await discoverRefs(fsOf($), cwd, known, prefixes)
        if (found.length > 0) {
          await update($, items, list => {
            const keep = list.filter(x => !found.some(f => f.id === x.id))
            return [...found, ...keep].slice(0, 30)
          })
          await update($, selected, () => found[0]!.id)
        }
      }
    }
    return res
  }).catch((_$, e, next) => next(e))
  // Passive hooks: on any error pass the event on so as not to silence other plugins in the chain.
  on('prompt.submit', async ($, e, next) => {
    await learn($, e.text)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    if (fallbackPrefixes) {
      await update($, configPrefixes, prev => prev || fallbackPrefixes).catch(() => undefined)
    }
    await $.command.register({
      name: 'ref',
      description: 'Show an artifact section by reference: /ref RV-1 (no argument: open the pane)',
    })
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await learn($, e.answer)
    const prefixes = await getPrefixes($, fallbackPrefixes)
    const ids = findIds(e.answer, prefixes)
    if (e.agentId === undefined && ids.length > 0) {
      // The search runs inside the hook: $ is valid only until the hook returns. The amount of work is bounded
      // (known prefixes, listing cache), and any error goes to status instead of being swallowed.
      const cwd = await $.session.cwd().catch(() => undefined)
      try {
        const known = await read($, roots).catch(() => [])
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
    const prefixes = await getPrefixes($, fallbackPrefixes)
    const ids = findIds(e.args, prefixes)
    const cwd = await $.session.cwd().catch(() => undefined)
    const known = await read($, roots).catch(() => [])

    if (ids.length > 0) {
      await learn($, e.args)
      const found = await resolveRefs(fsOf($), cwd, ids, e.args, known, prefixes)
      if (found.length === 0) return { text: `Not found: ${ids.join(', ')}. Searched in: ${[...known, 'cwd/features'].join(', ')}` }
      await update($, items, list => [...found, ...list.filter(x => !found.some(f => f.id === x.id))].slice(0, 30))
      await update($, selected, () => found[0]!.id)
      await update($, searchQuery, () => '')
    } else {
      // Auto-discover recent reference items with active prefixes on invocation without args
      const found = await discoverRefs(fsOf($), cwd, known, prefixes)
      if (found.length > 0) {
        await update($, items, list => {
          const keep = list.filter(x => !found.some(f => f.id === x.id))
          return [...found, ...keep].slice(0, 30)
        })
        await update($, selected, prev => prev ?? found[0]!.id)
      }
    }
    await $.ui.open({ id: PANE, title: 'Refs', focus: true }).catch(() => undefined)
    return { text: 'Refs pane opened.' }
  }).catch((_$, e, next) => (next.called ? next(e) : { text: 'Failed to handle /ref.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    const Input = 'Input' in els ? els.Input : undefined
    const list = await read($, items)
    const sel = await read($, selected)
    const query = await read($, searchQuery)
    const q = query.trim()
    const lowerQ = q.toLowerCase()

    const handleSearchSubmit = async (val: string) => {
      await update($, searchQuery, () => val)
      const prefixes = await getPrefixes($, fallbackPrefixes)
      const ids = findIds(val, prefixes)
      if (ids.length > 0) {
        const known = await read($, roots)
        const cwd = await $.session.cwd().catch(() => undefined)
        try {
          const found = await resolveRefs(fsOf($), cwd, ids, val, known, prefixes)
          if (found.length > 0) {
            await update($, items, prev => [...found, ...prev.filter(x => !found.some(f => f.id === x.id))].slice(0, 30))
            await update($, selected, () => found[0]!.id)
          }
        } catch {}
      }
    }

    if (list.length === 0) {
      const last = await read($, status)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text bold color="cyan">
                REFS PANE
              </Text>
              <Text dimColor>(0 refs)</Text>
            </Box>
          </Box>
          {Input !== undefined && (
            <Box marginBottom={1}>
              <Input
                key="search-input"
                placeholder="Filter or query reference IDs (e.g. RV-1, FB-2, T-3)..."
                value={query}
                onInput={(val: string) => update($, searchQuery, () => val)}
                onSubmit={handleSearchSubmit}
              />
            </Box>
          )}
          <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
            <Text dimColor>No references yet. They will appear from the model's answer or via /ref RV-1.</Text>
            {last !== '' && <Text dimColor>Last search: {last}</Text>}
          </Box>
        </Box>
      )
    }

    const filtered =
      q === ''
        ? list
        : list.filter(
            x => x.id.toLowerCase().includes(lowerQ) || x.text.toLowerCase().includes(lowerQ) || x.file.toLowerCase().includes(lowerQ),
          )

    const header = (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text bold color="cyan">
              REFS PANE
            </Text>
            <Text dimColor>
              {filtered.length} {filtered.length === 1 ? 'ref' : 'refs'}
              {filtered.length !== list.length ? ` (filtered from ${list.length})` : ''}
            </Text>
          </Box>
          {q !== '' && (
            <Button key="clear-filter" hotkey="c" onPress={() => update($, searchQuery, () => '')}>
              Clear (c)
            </Button>
          )}
        </Box>
        {Input !== undefined && (
          <Input
            key="search-input"
            placeholder="Filter or query reference IDs (e.g. RV-1, FB-2, T-3)..."
            value={query}
            onInput={(val: string) => update($, searchQuery, () => val)}
            onSubmit={handleSearchSubmit}
          />
        )}
      </Box>
    )

    const isSplit = (e.props.bodyColumns ?? 80) >= 90

    const renderCard = (x: RefItem, isSel: boolean, cardWidth?: number) => {
      const g = gistOf(x.text)
      const maxText = cardWidth ? Math.max(16, cardWidth - 4) : 60
      return (
        <Box
          key={`card-${x.id}`}
          borderStyle="round"
          borderColor={isSel ? 'cyan' : undefined}
          borderDimColor={!isSel}
          paddingX={1}
          flexDirection="column"
        >
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Button key={`btn-${x.id}`} variant={isSel ? 'primary' : 'secondary'} onPress={() => update($, selected, () => x.id)}>
              {x.id}
            </Button>
            <Text dimColor>
              {shortPath(x.file)}:{String(x.line)}
            </Text>
          </Box>
          {g.head !== '' && (
            <Text bold color={isSel ? 'cyan' : undefined}>
              {truncate(g.head, maxText)}
            </Text>
          )}
          {g.gist !== '' && <Text dimColor>{truncate(g.gist, maxText)}</Text>}
        </Box>
      )
    }

    if (isSplit) {
      if (filtered.length === 0) {
        return (
          <Box flexDirection="column">
            {header}
            <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
              <Text dimColor>No references matching "{q}".</Text>
            </Box>
          </Box>
        )
      }
      const activeItem = filtered.find(x => x.id === sel) ?? filtered[0]!
      const activeIdx = filtered.findIndex(x => x.id === activeItem.id)
      const prevIdx = activeIdx > 0 ? activeIdx - 1 : filtered.length - 1
      const nextIdx = activeIdx < filtered.length - 1 ? activeIdx + 1 : 0

      return (
        <Box flexDirection="column">
          {header}
          <Box flexDirection="row" gap={1}>
            <Box width={36} flexDirection="column">
              {filtered.map(x => renderCard(x, x.id === activeItem.id, 36))}
            </Box>
            <Box key={`detail-${activeItem.id}`} borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column" flexGrow={1}>
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
                <Box flexDirection="row" gap={1} alignItems="center">
                  <Text bold color="cyan">
                    [{activeItem.id}]
                  </Text>
                  <Text dimColor>
                    {shortPath(activeItem.file)}:{String(activeItem.line)}
                  </Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Button key="add-context" hotkey="a" onPress={() => addToChat($, activeItem)}>
                    Add to chat (a)
                  </Button>
                  <Button key="prev" hotkey="p" onPress={() => update($, selected, () => filtered[prevIdx]!.id)}>
                    ← (p)
                  </Button>
                  <Button key="next" hotkey="n" onPress={() => update($, selected, () => filtered[nextIdx]!.id)}>
                    (n) →
                  </Button>
                </Box>
              </Box>
              <Markdown key={`md-${activeItem.id}`} text={activeItem.text} />
            </Box>
          </Box>
        </Box>
      )
    }

    // Compact mode (bodyColumns < 90): Master-Detail
    if (filtered.length === 0) {
      return (
        <Box flexDirection="column">
          {header}
          <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
            <Text dimColor>No references matching "{q}".</Text>
          </Box>
        </Box>
      )
    }

    const cur = filtered.find(x => x.id === sel)
    if (cur === undefined) {
      // Master view
      return (
        <Box flexDirection="column">
          {header}
          {filtered.map(x => renderCard(x, false))}
        </Box>
      )
    }

    // Detail view
    const curIdx = filtered.findIndex(x => x.id === cur.id)
    const prevIdx = curIdx > 0 ? curIdx - 1 : filtered.length - 1
    const nextIdx = curIdx < filtered.length - 1 ? curIdx + 1 : 0

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="row" flexWrap="wrap" gap={1} marginBottom={1}>
          <Button key="back" hotkey="b" onPress={() => update($, selected, () => null)}>
            ← Overview (b)
          </Button>
          <Button key="add-context" hotkey="a" onPress={() => addToChat($, cur)}>
            Add to chat (a)
          </Button>
          <Button key="prev" hotkey="p" onPress={() => update($, selected, () => filtered[prevIdx]!.id)}>
            ← (p)
          </Button>
          <Button key="next" hotkey="n" onPress={() => update($, selected, () => filtered[nextIdx]!.id)}>
            (n) →
          </Button>
          {filtered.map(x => (
            <Button key={x.id} variant={x.id === cur.id ? 'primary' : 'secondary'} onPress={() => update($, selected, () => x.id)}>
              {x.id}
            </Button>
          ))}
        </Box>
        <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
            <Text bold color="cyan">
              [{cur.id}]
            </Text>
            <Text dimColor>
              {shortPath(cur.file)}:{String(cur.line)}
            </Text>
          </Box>
          <Markdown key={`md-${cur.id}`} text={cur.text} />
        </Box>
      </Box>
    )
  })
}
