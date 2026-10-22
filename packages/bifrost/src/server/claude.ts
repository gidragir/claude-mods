/**
 * Claude Code Adapter for Bifrost plugins.
 * Encapsulates the sandboxed worker runtime, atom state management,
 * slash command registration, error boundaries, and FsLike mapping.
 */

import type { EngineInterface, Register, RenderElement } from 'claude-code'
import { read, update } from 'claude-code'
import type { FsEntry, FsLike } from '../core/fs'

export type Host = EngineInterface

export interface ClaudePluginContext {
  host: Host
  fs: FsLike
  // biome-ignore lint/suspicious/noExplicitAny: Generic state helper
  getState: <T>(a: any) => Promise<T>
  // biome-ignore lint/suspicious/noExplicitAny: Generic state helper
  setState: <T>(a: any, updater: T | ((prev: T) => T)) => Promise<void>
}

export interface ClaudeCommandContext extends ClaudePluginContext {
  args: string
}

export interface ClaudePluginOptions {
  name: string
  // biome-ignore lint/suspicious/noExplicitAny: State definitions
  state?: Record<string, any>
  commands?: Array<{
    name: string
    description: string
    handler: (ctx: ClaudeCommandContext) => Promise<{ text?: string } | undefined> | { text?: string } | undefined
  }>
  renderPane?: {
    component: 'Pane' | 'AbovePrompt' | 'CommandOutput' | string
    requestId: string
    render: (ctx: ClaudePluginContext, props: unknown) => RenderElement | Promise<RenderElement>
  }
  onPromptSubmit?: (ctx: ClaudePluginContext, text: string) => Promise<string | undefined> | string | undefined
  onConfigSet?: (ctx: ClaudePluginContext, key: string, value: unknown) => Promise<void> | void
  onTurnComplete?: (ctx: ClaudePluginContext, answer: string) => Promise<void> | void
  onSessionStart?: (ctx: ClaudePluginContext) => Promise<void> | void
}

/**
 * Creates an FsLike instance backed by the Claude Code engine sandbox.
 */
export function createFsFromEngine($: {
  fs: { list: (path?: string) => Promise<FsEntry[]>; read: (path: string) => Promise<string> }
}): FsLike {
  return {
    list: p => $.fs.list(p),
    read: p => $.fs.read(p),
  }
}

function makeContext($: Host): ClaudePluginContext {
  const fs = createFsFromEngine($)
  return {
    host: $,
    fs,
    // biome-ignore lint/suspicious/noExplicitAny: Engine atom reading
    getState: <T>(a: unknown) => (read($, a as any) as Promise<T>).catch(() => undefined as unknown as T),
    setState: <T>(a: unknown, u: T | ((prev: T) => T)) =>
      // biome-ignore lint/suspicious/noExplicitAny: Engine atom updating
      (typeof u === 'function' ? update($, a as any, u as any) : update($, a as any, () => u)).catch(() => undefined) as Promise<void>,
  }
}

/**
 * Defines a Claude Code plugin with automatic error boundaries and atom lifecycle.
 */
export function defineClaudePlugin(config: ClaudePluginOptions): Register {
  return (on, _options) => {
    // 1. Session Start
    on('session.start', async ($, e, next) => {
      const ctx = makeContext($)

      // Register slash commands
      if (config.commands) {
        for (const cmd of config.commands) {
          try {
            await $.command.register({ name: cmd.name, description: cmd.description }).catch(() => undefined)
          } catch (err) {
            console.error(`Failed to register command /${cmd.name}:`, err)
          }
        }
      }

      if (config.onSessionStart) {
        await Promise.resolve(config.onSessionStart(ctx)).catch(err => console.error('onSessionStart error:', err))
      }

      return next(e)
    }).catch((_$, e, next) => next(e))

    // 2. Command Handlers
    if (config.commands) {
      for (const cmd of config.commands) {
        on('command.run', { command: cmd.name }, async ($, event, next) => {
          const ctx: ClaudeCommandContext = {
            ...makeContext($),
            args: typeof (event as { args?: unknown }).args === 'string' ? (event as { args: string }).args : '',
          }

          try {
            const res = await cmd.handler(ctx)
            if (res && typeof res === 'object' && 'text' in res) {
              return res
            }
          } catch (err) {
            console.error(`Error executing /${cmd.name}:`, err)
            return { text: `Error executing /${cmd.name}` }
          }
          return next(event)
        }).catch((_$, e, next) => (next.called ? next(e) : { text: `Failed to handle /${cmd.name}.` }))
      }
    }

    // 3. UI Render Pane
    if (config.renderPane) {
      const pane = config.renderPane
      // biome-ignore lint/suspicious/noExplicitAny: Generic component tag
      on('ui.render', { component: pane.component as any, requestId: pane.requestId }, async ($, props, _next) => {
        const ctx = makeContext($)
        return pane.render(ctx, props)
      })
    }

    // 4. Prompt Submit
    if (config.onPromptSubmit) {
      on('prompt.submit', async ($, event, next) => {
        const ctx = makeContext($)
        const text = typeof (event as { text?: unknown }).text === 'string' ? (event as { text: string }).text : ''
        const result = await Promise.resolve(config.onPromptSubmit!(ctx, text)).catch(() => undefined)
        if (typeof result === 'string') {
          return next({ ...event, text: result })
        }
        return next(event)
      }).catch((_$, e, next) => next(e))
    }

    // 5. Config Set
    if (config.onConfigSet) {
      on('config.set', async ($, event, next) => {
        const ctx = makeContext($)
        const ev = event as { key?: string; value?: unknown }
        if (ev.key) {
          await Promise.resolve(config.onConfigSet!(ctx, ev.key, ev.value)).catch(() => undefined)
        }
        return next(event)
      }).catch((_$, e, next) => next(e))
    }

    // 6. Turn Complete
    if (config.onTurnComplete) {
      on('turn.complete', async ($, event, next) => {
        const ctx = makeContext($)
        const answer = typeof (event as { answer?: unknown }).answer === 'string' ? (event as { answer: string }).answer : ''
        await Promise.resolve(config.onTurnComplete!(ctx, answer)).catch(() => undefined)
        return next(event)
      }).catch((_$, e, next) => next(e))
    }
  }
}
