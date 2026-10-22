/**
 * `definePlugin`: the one description of a plugin, read by every harness adapter and by the build.
 */

import { type Atom, declaredAtoms } from './atom'
import type { Host } from './host'
import type { VNode } from './vnode'

export type Target = 'claude' | 'agy'

export interface ConfigField {
  type: 'string' | 'number' | 'boolean'
  title?: string
  description?: string
  default?: string | number | boolean
}

export interface PaneSpec {
  /** Tab title (Claude Code) and view title (agy); defaults to the pane id. */
  title?: string
  component: () => VNode
  /** Runs when the pane is shown: `host.pane.open` in Claude Code, page load in agy. */
  onOpen?: (host: Host) => unknown
}

export interface CommandSpec {
  description: string
  argumentHint?: string
  /** A returned string is shown to the person as the command's output. */
  run: (host: Host, args: string) => unknown
}

export interface PromptSubmitEvent {
  text: string
  /** Set when the prompt is a slash command. */
  command?: string
  /** True for messages the engine composes itself. */
  isMeta?: boolean
}

/** A new prompt text, optionally with work to do once the prompt went through. */
export type PromptSubmitResult = string | { text: string; after?: () => unknown } | undefined

export interface TurnCompleteEvent {
  answer: string
  /** Set when a subagent's turn completed rather than the main loop's. */
  agentId?: string
}

/** Events only Claude Code raises. */
export interface ClaudeHooks {
  sessionStart?: (host: Host) => unknown
  promptSubmit?: (host: Host, e: PromptSubmitEvent) => PromptSubmitResult | Promise<PromptSubmitResult>
  turnComplete?: (host: Host, e: TurnCompleteEvent) => unknown
  configChange?: (host: Host, key: string, value: unknown) => unknown
}

export interface PluginSpec {
  /** kebab-case; also the engine state namespace and the agy sidecar id. */
  name: string
  version: string
  description: string
  displayName?: string
  /** Defaults to the repository root package.json's `author`. */
  author?: string | { name: string; email?: string; url?: string }
  license?: string
  repository?: string
  suggestedPrompts?: string[]
  /** Harnesses to build for; both by default. */
  targets?: Target[]
  /** User settings: Claude Code `userConfig`, env `<NAME>_<KEY>` in agy. */
  config?: Record<string, ConfigField>
  panes?: Record<string, PaneSpec>
  commands?: Record<string, CommandSpec>
  claude?: ClaudeHooks
}

export interface Plugin extends PluginSpec {
  readonly targets: Target[]
  /** Atoms declared when the plugin was defined: what the Claude build turns into engine atoms. */
  readonly atoms: readonly Atom<unknown>[]
}

/** The engine state cell (Claude Code) that keeps config values set during the session. */
export const CONFIG_CELL = '__config'

const NAME = /^[a-z][a-z0-9-]{1,40}$/

export function definePlugin(spec: PluginSpec): Plugin {
  if (!NAME.test(spec.name)) throw new Error(`bifrost: plugin name "${spec.name}" must be kebab-case (${NAME})`)
  for (const id of Object.keys(spec.panes ?? {})) if (!NAME.test(id)) throw new Error(`bifrost: pane id "${id}" must be kebab-case`)
  for (const id of Object.keys(spec.commands ?? {}))
    if (!/^[a-z][a-z0-9-:]*$/.test(id)) throw new Error(`bifrost: command "${id}" must be lowercase`)
  return Object.freeze({ ...spec, targets: spec.targets ?? (['claude', 'agy'] as Target[]), atoms: declaredAtoms() })
}

/** The pane `host.pane.open()` shows without an id. */
export const defaultPane = (plugin: PluginSpec): string | undefined => Object.keys(plugin.panes ?? {})[0]

/** A config value from a raw string: blank means unset; numbers and booleans are not parsed here. */
export const configValue = (raw: unknown): string | undefined => {
  if (raw === undefined || raw === null) return undefined
  const s = String(raw).trim()
  return s === '' ? undefined : s
}
