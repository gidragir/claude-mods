/**
 * Named state cells.
 *
 * `atom(key, initial)` describes a value; it holds nothing itself. Each harness keeps the value where
 * it survives best: engine state in Claude Code (across hot reloads), process memory in agy.
 * Declare atoms at module level: `bifrost build` lists them to generate the literal engine atoms the
 * Claude scanner insists on.
 */

export interface Atom<T> {
  readonly key: string
  readonly initial: T
}

const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const registry = new Map<string, Atom<unknown>>()

/** Declares (or returns the already declared) atom `key`; the first `initial` wins. */
export function atom<T>(key: string, initial: T): Atom<T> {
  if (!KEY.test(key)) throw new Error(`bifrost: atom key "${key}" must match ${KEY}`)
  const known = registry.get(key)
  if (known) return known as Atom<T>
  const created: Atom<T> = Object.freeze({ key, initial })
  registry.set(key, created as Atom<unknown>)
  return created
}

/** Every atom declared so far in this process (what the build turns into engine atoms). */
export function declaredAtoms(): Atom<unknown>[] {
  return [...registry.values()]
}

export type Updater<T> = T | ((prev: T) => T)

export const applyUpdater = <T>(prev: T, next: Updater<T>): T => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next)

/** Where atom values live. Implementations never throw: a failed read answers the initial. */
export interface StateStore {
  get<T>(a: Atom<T>): Promise<T>
  set<T>(a: Atom<T>, next: Updater<T>): Promise<void>
}

/** A store in memory, with change notification (agy, tests). */
export class MemoryStore implements StateStore {
  private values = new Map<string, unknown>()
  private listeners = new Set<(key: string) => void>()

  async get<T>(a: Atom<T>): Promise<T> {
    return this.peek(a)
  }

  peek<T>(a: Atom<T>): T {
    return this.values.has(a.key) ? (this.values.get(a.key) as T) : a.initial
  }

  async set<T>(a: Atom<T>, next: Updater<T>): Promise<void> {
    const value = applyUpdater(this.peek(a), next)
    if (Object.is(value, this.values.get(a.key)) && this.values.has(a.key)) return
    this.values.set(a.key, value)
    for (const l of this.listeners) l(a.key)
  }

  subscribe(listener: (key: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
