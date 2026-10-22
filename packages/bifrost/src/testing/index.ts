/**
 * Test kit: drive a plugin under Bun without any host.
 *
 *   const host = createTestHost(plugin, { selection: 'retry three times' })
 *   expect(await runCommand(plugin, 'comment', 'why?', { host })).toBe(undefined)
 *   const ui = await mount(plugin, 'comments', { host, columns: 120 })
 *   await ui.input('note', 'why three?')
 *   expect(ui.find({ text: /1 comment/ })).toBeDefined()
 *   expect(ui.html()).toContain('<article')            // the agy rendering of the same tree
 *
 * The real engine is still exercised by `claude plugin test` on the built plugin (test/engine).
 */

import { renderHtml } from '../agy/html'
import { type Atom, MemoryStore } from '../core/atom'
import type { FsEntry, FsLike } from '../core/fs'
import { type Host, viewport } from '../core/host'
import { configValue, defaultPane, type Plugin, type PromptSubmitResult } from '../core/plugin'
import { renderComponent } from '../core/render'
import { isElement, type PrimitiveName, textOf, type VElement, type VNode } from '../core/vnode'

export interface TestHostOptions {
  /** Files as `{ path: content }`; folders are implied by the paths. */
  files?: Record<string, string>
  fs?: FsLike
  cwd?: string
  config?: Record<string, string>
  selection?: string
  /** Initial atom values. */
  state?: Array<[Atom<unknown>, unknown]>
  harness?: 'claude' | 'agy'
}

export interface TestHost extends Host {
  readonly store: MemoryStore
  /** What the plugin asked the host to do, in order. */
  readonly calls: {
    toasts: string[]
    prompt: { mode: 'append' | 'replace'; text: string }[]
    submitted: string[]
    opened: string[]
    closed: string[]
    focused: string[]
    scrolled: string[]
  }
  /** Replaces the current selection (`undefined` clears it). */
  select(text: string | undefined): void
  /** The prompt box's text (appends and replaces applied). */
  promptText: string
}

/** An in-memory `FsLike` over `{ path: content }`; paths use `/`. */
export function memoryFs(files: Record<string, string>): FsLike {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const all = Object.fromEntries(Object.entries(files).map(([p, c]) => [norm(p), c]))
  return {
    async list(dir = '.') {
      const prefix = `${norm(dir)}/`
      const seen = new Map<string, FsEntry>()
      for (const p of Object.keys(all)) {
        if (!p.startsWith(prefix)) continue
        const [name, ...rest] = p.slice(prefix.length).split('/')
        if (name) seen.set(name, { name, kind: rest.length > 0 ? 'dir' : 'file', mtimeMs: 0 })
      }
      return [...seen.values()]
    },
    async read(path) {
      const c = all[norm(path)]
      if (c === undefined) throw new Error(`ENOENT: ${path}`)
      return c
    },
  }
}

export function createTestHost(plugin: Plugin, options: TestHostOptions = {}): TestHost {
  const store = new MemoryStore()
  for (const [a, v] of options.state ?? []) void store.set(a, v)
  let selection = options.selection
  const calls: TestHost['calls'] = { toasts: [], prompt: [], submitted: [], opened: [], closed: [], focused: [], scrolled: [] }
  const host: TestHost = {
    harness: options.harness ?? 'claude',
    store,
    calls,
    promptText: '',
    select: text => {
      selection = text
    },
    get: a => store.get(a),
    set: (a, next) => store.set(a, next),
    fs: options.fs ?? memoryFs(options.files ?? {}),
    cwd: async () => options.cwd,
    config: async key => configValue(options.config?.[key]) ?? configValue(plugin.config?.[key]?.default),
    selection: async () => (selection === undefined || selection.trim() === '' ? undefined : { text: selection }),
    prompt: {
      append: async text => {
        calls.prompt.push({ mode: 'append', text })
        host.promptText += text
      },
      replace: async text => {
        calls.prompt.push({ mode: 'replace', text })
        host.promptText = text
      },
      read: async () => host.promptText,
      submit: async text => {
        calls.submitted.push(text)
      },
    },
    toast: message => void calls.toasts.push(message),
    pane: {
      open: async (id = defaultPane(plugin)) => {
        if (id === undefined) return false
        await plugin.panes?.[id]?.onOpen?.(host)
        calls.opened.push(id)
        return true
      },
      close: async (id = defaultPane(plugin)) => void (id !== undefined && calls.closed.push(id)),
      focus: async key => void calls.focused.push(key),
    },
    scrollTo: async ref => void calls.scrolled.push(ref),
  }
  return host
}

export interface Query {
  key?: string
  type?: PrimitiveName
  text?: string | RegExp
}

function* walk(node: VNode): Generator<VElement> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n)
  else if (isElement(node)) {
    yield node
    for (const c of node.children) yield* walk(c)
  }
}

const matches = (el: VElement, q: Query) => {
  if (q.type && el.type !== q.type) return false
  if (q.key !== undefined && (el.props as { key?: string }).key !== q.key) return false
  if (q.text !== undefined) {
    const t = textOf(el)
    return typeof q.text === 'string' ? t === q.text : q.text.test(t)
  }
  return true
}

export interface MountOptions extends TestHostOptions {
  host?: TestHost
  columns?: number
  surface?: string
  canInput?: boolean
}

export interface Mounted {
  readonly host: TestHost
  readonly tree: VNode
  /** All text of the pane. */
  text(): string
  /** The pane as the agy webview gets it. */
  html(): string
  find(q: Query): VElement | undefined
  findAll(q: Query): VElement[]
  press(key: string): Promise<void>
  input(key: string, value: string): Promise<void>
  submit(key: string, value: string): Promise<void>
  select(key: string, value: string): Promise<void>
  rerender(): Promise<void>
}

/** Renders a pane (default: the first) the way a harness would, and drives it by element key. */
export async function mount(plugin: Plugin, paneId = defaultPane(plugin), options: MountOptions = {}): Promise<Mounted> {
  const pane = paneId === undefined ? undefined : plugin.panes?.[paneId]
  if (!pane || paneId === undefined) throw new Error(`${plugin.name} has no pane ${paneId ?? '(none)'}`)
  const host = options.host ?? createTestHost(plugin, options)
  const harness = options.harness ?? host.harness
  const known = new Map<string, Atom<unknown>>()
  const vp = viewport({
    harness: harness === 'agy' ? 'agy' : 'claude',
    surface: options.surface ?? (harness === 'agy' ? 'web' : 'terminal'),
    columns: options.columns ?? 80,
    canInput: options.canInput ?? true,
  })
  let tree: VNode = null
  const rerender = async () => {
    tree = await renderComponent(pane.component, { host, viewport: vp, known, label: `${plugin.name}/${paneId}` })
  }
  await rerender()

  const element = (key: string, type: PrimitiveName) => {
    const el = [...walk(tree)].find(e => e.type === type && (e.props as { key?: string }).key === key)
    if (!el) throw new Error(`no ${type} with key "${key}" in ${plugin.name}/${paneId}`)
    return el.props as Record<string, (v?: string) => unknown>
  }
  const act = async (fn: () => unknown) => {
    await fn()
    await rerender()
  }

  return {
    host,
    get tree() {
      return tree
    },
    text: () => textOf(tree),
    html: () => renderHtml(tree).html,
    find: q => [...walk(tree)].find(e => matches(e, q)),
    findAll: q => [...walk(tree)].filter(e => matches(e, q)),
    press: key => act(() => element(key, 'Button').onPress!()),
    input: (key, value) => act(() => element(key, 'Input').onInput?.(value)),
    submit: (key, value) => act(() => element(key, 'Input').onSubmit!(value)),
    select: (key, value) => act(() => element(key, 'Select').onSelect!(value)),
    rerender,
  }
}

/** Runs a command; resolves to the text it shows, if any. */
export async function runCommand(plugin: Plugin, name: string, args = '', options: { host?: TestHost } & TestHostOptions = {}) {
  const cmd = plugin.commands?.[name]
  if (!cmd) throw new Error(`${plugin.name} has no command /${name}`)
  const out = await cmd.run(options.host ?? createTestHost(plugin, options), args)
  return typeof out === 'string' ? out : undefined
}

/** Runs `claude.promptSubmit` (and its `after`); resolves to the text the prompt goes on with. */
export async function submitPrompt(plugin: Plugin, text: string, options: { host?: TestHost; command?: string } & TestHostOptions = {}) {
  const hook = plugin.claude?.promptSubmit
  if (!hook) return text
  const res: PromptSubmitResult = await hook(options.host ?? createTestHost(plugin, options), { text, command: options.command })
  if (res === undefined) return text
  if (typeof res === 'object' && res.after) await res.after()
  return typeof res === 'string' ? res : res.text
}

/** Runs `claude.turnComplete` with a model answer. */
export async function completeTurn(plugin: Plugin, answer: string, options: { host?: TestHost; agentId?: string } & TestHostOptions = {}) {
  await plugin.claude?.turnComplete?.(options.host ?? createTestHost(plugin, options), { answer, agentId: options.agentId })
}
