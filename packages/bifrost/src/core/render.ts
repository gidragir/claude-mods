/**
 * Hooks and the render loop.
 *
 * Components are plain functions evaluated eagerly; hooks are keyed by atom, not by call order, so
 * they may sit in conditions and loops. Host state is asynchronous, so a render works in passes:
 * read the atoms this pane used last time, run the component synchronously against those values,
 * and if it touched an atom not read yet, read it and run once more.
 */

import { type Atom, atom, type Updater } from './atom'
import type { Host, Viewport } from './host'
import { Box, Text, type VNode } from './vnode'

interface Frame {
  host: Host
  viewport: Viewport
  values: Map<string, unknown>
  missing: Map<string, Atom<unknown>>
}

let current: Frame | undefined

function frame(hook: string): Frame {
  if (!current) throw new Error(`bifrost: ${hook}() is called outside a component render`)
  return current
}

export type Setter<T> = (next: Updater<T>) => Promise<void>

/** The atom's value for this render, and a setter that writes through the host. */
export function useAtom<T>(a: Atom<T>): [T, Setter<T>] {
  const f = frame('useAtom')
  const host = f.host
  if (!f.values.has(a.key)) f.missing.set(a.key, a as Atom<unknown>)
  const value = f.values.has(a.key) ? (f.values.get(a.key) as T) : a.initial
  return [value, next => host.set(a, next)]
}

export const useValue = <T>(a: Atom<T>): T => useAtom(a)[0]

/** `useAtom(atom(key, initial))`. Write `key` as a string literal: the build reads it from the source. */
export const useState = <T>(key: string, initial: T): [T, Setter<T>] => useAtom(atom(key, initial))

/** The host (state, prompt, toast, files ...) for event handlers inside a component. */
export const useHost = (): Host => frame('useHost').host

export const useViewport = (): Viewport => frame('useViewport').viewport

export interface RenderOptions {
  host: Host
  viewport: Viewport
  /** Atoms this pane read before: kept by the caller between renders. */
  known: Map<string, Atom<unknown>>
  label?: string
}

const MAX_PASSES = 4

/** Renders a component to a tree; a throwing component renders as an error notice instead. */
export async function renderComponent(component: () => VNode, { host, viewport, known, label = 'pane' }: RenderOptions): Promise<VNode> {
  let tree: VNode = null
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const atoms = [...known.values()]
    const read = await Promise.all(atoms.map(a => host.get(a)))
    const f: Frame = { host, viewport, values: new Map(atoms.map((a, i) => [a.key, read[i]])), missing: new Map() }
    const outer = current
    current = f
    try {
      tree = component()
    } catch (err) {
      return errorNotice(label, err)
    } finally {
      current = outer
    }
    if (f.missing.size === 0) return tree
    for (const [key, a] of f.missing) known.set(key, a)
  }
  return tree
}

export function errorNotice(label: string, err: unknown): VNode {
  const message = err instanceof Error ? err.message : String(err)
  return Box({
    borderStyle: 'round',
    borderColor: 'red',
    paddingX: 1,
    flexDirection: 'column',
    children: [Text({ color: 'red', bold: true, children: `${label} failed` }), Text({ dimColor: true, children: message })],
  })
}
