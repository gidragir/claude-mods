// State and the actions on it. Everything goes through the Host, so it runs the same in Claude Code and agy.

import { atom, type Host } from '@gidragir/bifrost'
import { discoverRefs, findIds, HOME, parsePrefixes, type Ref, resolveRefs, rootsIn, shortPath } from './refs'

export const MAX_ITEMS = 30
const MAX_ROOTS = 10

export const items = atom('items', [] as Ref[])
export const selected = atom('selected', null as string | null)
/** features/ and docs/ folders seen in the conversation, newest first. */
export const roots = atom('roots', [] as string[])
export const status = atom('status', '')
export const query = atom('query', '')

/** The `prefixes` setting, or the default set when it is blank or yields nothing. */
export async function prefixesOf(host: Host): Promise<Record<string, string>> {
  const raw = await host.config('prefixes')
  const custom = raw === undefined ? {} : parsePrefixes(raw)
  return Object.keys(custom).length > 0 ? custom : HOME
}

/** Remembers the features/docs folders a text names. */
export async function learnRoots(host: Host, text: string): Promise<void> {
  const seen = rootsIn(text)
  if (seen.length > 0) await host.set(roots, list => [...seen, ...list.filter(r => !seen.includes(r))].slice(0, MAX_ROOTS))
}

/** Puts `found` on top of the list; true when one of them is new. */
export async function remember(host: Host, found: Ref[]): Promise<boolean> {
  const before = await host.get(items)
  await host.set(items, list => [...found, ...list.filter(x => !found.some(f => f.id === x.id))].slice(0, MAX_ITEMS))
  return found.some(f => !before.some(x => x.id === f.id))
}

/** Resolves the references a text mentions; `undefined` when it mentions none. `fresh`: one was not listed yet. */
export async function lookup(
  host: Host,
  text: string,
): Promise<{ ids: string[]; found: Ref[]; searched: string[]; fresh: boolean } | undefined> {
  const prefixes = await prefixesOf(host)
  const ids = findIds(text, prefixes)
  if (ids.length === 0) return undefined
  await learnRoots(host, text)
  const cwd = await host.cwd()
  const known = await host.get(roots)
  const found = await resolveRefs(host.fs, cwd, ids, text, known, prefixes)
  await host.set(status, `${ids.join(', ')} → found ${found.length}; cwd: ${cwd ?? '?'}; roots: ${known.length}`)
  const fresh = found.length > 0 && (await remember(host, found))
  return { ids, found, searched: [...known, 'cwd/features'], fresh }
}

/** Fills the list from the artifacts near cwd; selects the first found unless something is selected (or `reselect`). */
export async function discover(host: Host, reselect = false): Promise<void> {
  const found = await discoverRefs(host.fs, await host.cwd(), await host.get(roots), await prefixesOf(host))
  if (found.length === 0) return
  await remember(host, found)
  await host.set(selected, prev => (reselect ? null : prev) ?? found[0]!.id)
}

/** Quotes the selected text (or the whole section) into the prompt as a Markdown blockquote. */
export async function addToChat(host: Host, item: Ref): Promise<void> {
  const sel = await host.selection()
  const quote = (sel?.text ?? item.text).trim()
  if (quote === '') return
  const meta = shortPath(item.file) ? ` (${shortPath(item.file)}:${item.line})` : ''
  const lines = quote
    .split('\n')
    .map(l => `> ${l}`)
    .join('\n')
  await host.prompt.append(`\n> **[${item.id}]**${meta}:\n${lines}\n\n`)
  host.toast(sel ? `Added selected text from [${item.id}] to chat` : `Added [${item.id}] context to chat prompt`)
}
