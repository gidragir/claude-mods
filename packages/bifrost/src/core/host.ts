/**
 * The host a plugin talks to, the same interface in every harness.
 *
 * Handlers, commands and components never see the engine's `$` or Node: they get a `Host`. Every
 * method is guarded by the adapter: a refused or failed host call resolves quietly (`undefined`,
 * `false`, `''`) instead of rejecting into the worker. Capabilities a harness lacks degrade the same
 * way (agy has no prompt to read, for example).
 */

import type { Atom, Updater } from './atom'
import type { FsLike } from './fs'

export type Harness = 'claude' | 'agy' | 'test'

export interface Selection {
  text: string
  /** Where the text came from (a transcript row id in Claude Code), when the host says. */
  ref?: string
}

export interface Host {
  readonly harness: Harness
  get<T>(a: Atom<T>): Promise<T>
  set<T>(a: Atom<T>, next: Updater<T>): Promise<void>
  /** Files: `$.fs` in Claude Code, `node:fs` in agy. */
  readonly fs: FsLike
  /** The session's working directory (Claude) or the first workspace folder (agy). */
  cwd(): Promise<string | undefined>
  /** A user setting declared in `config`; blank values count as unset. */
  config(key: string): Promise<string | undefined>
  /** Text the person selected (the chat in Claude Code, the pane in agy). */
  selection(): Promise<Selection | undefined>
  readonly prompt: {
    append(text: string): Promise<void>
    replace(text: string): Promise<void>
    read(): Promise<string>
    /** Sends `text` as the person's next message. */
    submit(text: string): Promise<void>
  }
  toast(message: string): void
  readonly pane: {
    /** Shows a pane (default: the plugin's first); `false` when the surface could not place it. */
    open(id?: string, options?: { focus?: boolean }): Promise<boolean>
    close(id?: string): Promise<void>
    /** Moves the keyboard to the element `key` of a pane. */
    focus(key: string, id?: string): Promise<void>
  }
  /** Scrolls the transcript to a selection's `ref`. */
  scrollTo(ref: string): Promise<void>
}

/** What a component knows about where it is drawn. */
export interface Viewport {
  readonly harness: Harness
  /** `terminal`, `desktop`, `vscode`, `mobile` (Claude Code) or `web` (agy). */
  readonly surface: string
  /** Cells across the pane body. */
  readonly columns: number
  /** True when the surface draws `Input`/`Select`. */
  readonly canInput: boolean
  /** True from 90 columns: room for a sidebar beside a detail view. */
  readonly wide: boolean
}

export const WIDE_COLUMNS = 90

export const viewport = (v: Omit<Viewport, 'wide'>): Viewport => ({ ...v, wide: v.columns >= WIDE_COLUMNS })
