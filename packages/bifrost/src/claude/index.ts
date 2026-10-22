/**
 * Claude Code adapter: installs a plugin's panes, commands and events as engine hooks.
 *
 * The engine scans a hooks module before running it, so this file keeps to its rules: every `on`
 * names its event literally, `$` is only ever spelled `$.noun.verb(...)` or handed to a top-level
 * function, and state goes through `readCell`/`writeCell`, which `bifrost build` generates per plugin
 * with literal engine atoms (`virtual:bifrost/claude-state`).
 */

import { CELLS, readCell, writeCell } from 'virtual:bifrost/claude-state'
import type { EngineInterface, On } from 'claude-code'
import { type Atom, applyUpdater, MemoryStore, type Updater } from '../core/atom'
import type { FsLike } from '../core/fs'
import { type Host, viewport } from '../core/host'
import { CONFIG_CELL, configValue, defaultPane, type Plugin } from '../core/plugin'
import { renderComponent } from '../core/render'
import { guard, toEngine } from './elements'

// Atoms the build did not see (a `useState` key that is not a string literal): kept in memory, so
// they work but reset on reload. Each is reported once.
const stray = new MemoryStore()
const reported = new Set<string>()
function strayAtom(key: string): void {
  if (reported.has(key)) return
  reported.add(key)
  console.warn(`bifrost: state "${key}" is not known to the build (declare it with atom() at module level); it resets on reload`)
}

function readAtom<T>($: EngineInterface, a: Atom<T>): Promise<T> {
  if (!CELLS.has(a.key)) {
    strayAtom(a.key)
    return stray.get(a)
  }
  return readCell($, a.key).then(
    v => (v === undefined ? a.initial : (v as T)),
    () => a.initial,
  )
}

function writeAtom<T>($: EngineInterface, a: Atom<T>, next: Updater<T>): Promise<void> {
  if (!CELLS.has(a.key)) {
    strayAtom(a.key)
    return stray.set(a, next)
  }
  return writeCell($, a.key, (prev: unknown) => applyUpdater(prev === undefined ? a.initial : (prev as T), next)).then(
    () => undefined,
    () => undefined,
  )
}

function readConfig($: EngineInterface): Promise<Record<string, string>> {
  return readCell($, CONFIG_CELL).then(
    v => (v && typeof v === 'object' ? (v as Record<string, string>) : {}),
    () => ({}),
  )
}

function writeConfig($: EngineInterface, key: string, value: string): Promise<void> {
  return writeCell($, CONFIG_CELL, (prev: unknown) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [key]: value })).then(
    () => undefined,
    () => undefined,
  )
}

function engineFs($: EngineInterface): FsLike {
  return {
    list: p => $.fs.list(p),
    read: p => $.fs.read(p),
  }
}

/** The plugin's `Host` over the engine's `$`. */
export function claudeHost($: EngineInterface, plugin: Plugin, options: Record<string, unknown>): Host {
  const title = (id: string) => plugin.panes?.[id]?.title ?? id
  const host: Host = {
    harness: 'claude',
    get: a => readAtom($, a),
    set: (a, next) => writeAtom($, a, next),
    fs: engineFs($),
    cwd: () => $.session.cwd().catch(() => undefined),
    config: async key => {
      const stored = await readConfig($)
      return configValue(stored[key]) ?? configValue(options[key]) ?? configValue(plugin.config?.[key]?.default)
    },
    selection: async () => {
      const sel = await $.ui.selection().catch(() => undefined)
      if (!sel || sel.text.trim() === '') return undefined
      return sel.requestId === undefined ? { text: sel.text } : { text: sel.text, ref: sel.requestId }
    },
    prompt: {
      append: async text => {
        await $.prompt.fill({ text, mode: 'append' }).catch(() => undefined)
      },
      replace: async text => {
        await $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)
      },
      read: () =>
        $.prompt.read().then(
          box => box.text,
          () => '',
        ),
      submit: async text => {
        await $.prompt.submit({ text, asUser: true }).catch(() => undefined)
      },
    },
    toast: message => {
      try {
        $.ui.toast(message)
      } catch {}
    },
    pane: {
      open: async (id = defaultPane(plugin), options = {}) => {
        if (id === undefined) return false
        const onOpen = plugin.panes?.[id]?.onOpen
        if (onOpen) await guard(() => onOpen(host))
        const shown = await $.ui.open({ id, title: title(id), ...(options.focus ? { focus: true } : {}) }).catch(() => undefined)
        return shown?.isPlaced === true
      },
      close: async (id = defaultPane(plugin)) => {
        if (id !== undefined) await $.ui.close({ id }).catch(() => undefined)
      },
      focus: async (key, id = defaultPane(plugin)) => {
        if (id !== undefined) await $.ui.focus({ requestId: id, key }).catch(() => undefined)
      },
    },
    scrollTo: async ref => {
      await $.ui.scroll({ to: { requestId: ref }, block: 'center' }).catch(() => undefined)
    },
  }
  return host
}

const configKey = (plugin: Plugin, raw: string): string | undefined => {
  const key = raw.slice(raw.lastIndexOf('.') + 1)
  return plugin.config && key in plugin.config ? key : undefined
}

/** Registers every hook the plugin needs. Called by the generated `register`. */
export function install(on: On, options: Record<string, unknown>, plugin: Plugin): void {
  const known = new Map<string, Map<string, Atom<unknown>>>()
  const knownFor = (pane: string) => {
    const m = known.get(pane) ?? new Map<string, Atom<unknown>>()
    known.set(pane, m)
    return m
  }

  on('session.start', async ($, e, next) => {
    for (const [name, cmd] of Object.entries(plugin.commands ?? {})) {
      const spec = { name, description: cmd.description, ...(cmd.argumentHint ? { argumentHint: cmd.argumentHint } : {}) }
      await $.command.register(spec).catch(() => undefined)
    }
    const hook = plugin.claude?.sessionStart
    if (hook) {
      const host = claudeHost($, plugin, options)
      await guard(() => hook(host))
    }
    return next(e)
  }).catch((_$, e, next) => next(e))

  for (const [name, cmd] of Object.entries(plugin.commands ?? {})) {
    on('command.run', { command: name }, async ($, e) => {
      const host = claudeHost($, plugin, options)
      const out = await cmd.run(host, typeof e.args === 'string' ? e.args : '')
      return typeof out === 'string' ? { text: out } : {}
    }).catch((_$, e, next) => (next.called ? next(e) : { text: `${plugin.name}: /${name} failed.` }))
  }

  for (const [id, pane] of Object.entries(plugin.panes ?? {})) {
    on('ui.render', { component: 'Pane', requestId: id }, async ($, e) => {
      const table = $.ui.resolve(e)
      const host = claudeHost($, plugin, options)
      const vp = viewport({ harness: 'claude', surface: e.surface, columns: e.props.bodyColumns, canInput: 'Input' in table })
      const tree = await renderComponent(pane.component, { host, viewport: vp, known: knownFor(id), label: `${plugin.name}/${id}` })
      return toEngine(tree, table as never)
    })
  }

  const promptSubmit = plugin.claude?.promptSubmit
  if (promptSubmit) {
    on('prompt.submit', async ($, e, next) => {
      const host = claudeHost($, plugin, options)
      const res = await promptSubmit(host, { text: e.text, command: e.command?.name, isMeta: e.isMeta })
      if (res === undefined) return next(e)
      const out = await next({ ...e, text: typeof res === 'string' ? res : res.text })
      if (typeof res === 'object' && res.after) await guard(res.after)
      return out
    }).catch((_$, e, next) => next(e))
  }

  const turnComplete = plugin.claude?.turnComplete
  if (turnComplete) {
    on('turn.complete', async ($, e, next) => {
      const host = claudeHost($, plugin, options)
      await guard(() => turnComplete(host, { answer: e.answer, ...(e.agentId === undefined ? {} : { agentId: e.agentId }) }))
      return next(e)
    }).catch((_$, e, next) => next(e))
  }

  const configChange = plugin.claude?.configChange
  if (plugin.config || configChange) {
    on('config.set', async ($, e, next) => {
      const res = await next(e)
      const key = configKey(plugin, e.key)
      if (key !== undefined) {
        await writeConfig($, key, typeof e.value === 'string' ? e.value : String(e.value ?? ''))
        if (configChange) {
          const host = claudeHost($, plugin, options)
          await guard(() => configChange(host, key, e.value))
        }
      }
      return res
    }).catch((_$, e, next) => next(e))
  }
}

export { guard, toEngine } from './elements'
