// State and the actions on it, through the Host: the same in Claude Code and agy.

import { atom, type Host } from '@gidragir/bifrost'
import { appendComments, type Comment, type Draft, type Editing } from './comments'

export const PANE = 'quote-comments'

export const comments = atom('comments', [] as Comment[])
export const draft = atom('draft', null as Draft | null)
export const nextId = atom('nextId', 1)
export const editing = atom('editing', null as Editing)

export async function add(host: Host, quote: string, ref: string | undefined, note: string): Promise<void> {
  const id = await host.get(nextId)
  await host.set(nextId, n => n + 1)
  await host.set(comments, list => [...list, { id, quote, ...(ref === undefined ? {} : { ref }), note: note.trim() }])
}

export async function clear(host: Host): Promise<void> {
  await host.set(comments, [])
  await host.set(draft, null)
  await host.set(editing, null)
}

export type Captured = 'saved' | 'draft' | 'paste' | 'hidden'

/**
 * Starts a comment on the current selection: saved right away with a note, a draft without one,
 * a paste field where the surface shares no selection. `hidden` when the pane could not be shown.
 */
export async function capture(host: Host, note: string): Promise<Captured> {
  await host.set(editing, null)
  const selected = await host.selection()
  const text = note.trim()
  let kind: Exclude<Captured, 'hidden'>
  if (selected === undefined) {
    kind = 'paste'
    await host.set(draft, { quote: '', ...(text === '' ? {} : { note: text }) })
  } else if (text !== '') {
    kind = 'saved'
    await add(host, selected.text, selected.ref, text)
    await host.set(draft, null)
  } else {
    kind = 'draft'
    await host.set(draft, { quote: selected.text, ...(selected.ref === undefined ? {} : { ref: selected.ref }) })
  }
  const shown = await host.pane.open(PANE, { focus: true })
  return shown || kind === 'saved' ? kind : 'hidden'
}

/** Sends the prompt box's text with the comments under it, as the person's next message. */
export async function sendAll(host: Host): Promise<void> {
  const box = await host.prompt.read()
  const text = appendComments(box, await host.get(comments))
  if (text.trim() === '') return
  await clear(host)
  if (box !== '') await host.prompt.replace('')
  await host.pane.close(PANE)
  await host.prompt.submit(text)
}
