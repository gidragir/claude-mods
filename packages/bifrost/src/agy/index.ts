/**
 * Antigravity (agy) adapter: the plugin's panes as a webview served from the aux-pane process.
 *
 * The server keeps state and renders; the page only shows HTML and posts events back:
 *   GET  /, /pane/<id>   page shell          POST /_bf/render   { html, effects, version }
 *   GET  /_bf/stream     SSE "change"         POST /_bf/event    run a handler, then render
 *   GET  /preload.js     window.sidecar (no token)               GET /api/health
 * Every route but /preload.js requires ANTIGRAVITY_SIDECAR_UI_TOKEN (header or ?token=) when set.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { watch } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Atom, MemoryStore } from '../core/atom'
import type { FsLike } from '../core/fs'
import { type Host, viewport } from '../core/host'
import { configValue, defaultPane, type Plugin } from '../core/plugin'
import { renderComponent } from '../core/render'
import STYLE_CSS from './bifrost.css' with { type: 'text' }
import CLIENT_JS from './client.js' with { type: 'text' }
import { nodeFs } from './fs'
import { type ElementHandlers, escapeHtml, renderHtml } from './html'
import { preloadJs } from './preload'

/** What a handler asked the page to do: the page carries it out after the response. */
export type Effect =
  | { type: 'toast'; message: string }
  | { type: 'prompt'; mode: 'append' | 'replace'; text: string }
  | { type: 'submit'; text: string }
  | { type: 'focus'; key: string }

export interface AgyOptions {
  port?: number
  token?: string
  /** Exit when the bundle changes on disk, so Antigravity restarts it with the new build. */
  dev?: boolean
  fs?: FsLike
  /** Working directory before the page reports a workspace. */
  cwd?: string
  env?: Record<string, string | undefined>
}

interface PaneState {
  known: Map<string, Atom<unknown>>
  handlers: Map<string, ElementHandlers>
}

interface ClientRequest {
  pane?: string
  id?: string
  kind?: keyof ElementHandlers
  value?: unknown
  initial?: boolean
  columns?: number
  selection?: string
  workspaceUris?: string[]
}

const MAX_BODY = 1 << 20

function readBody(req: IncomingMessage): Promise<ClientRequest> {
  return new Promise((done, fail) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > MAX_BODY) {
        fail(new Error('request too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        done(body === '' ? {} : (JSON.parse(body) as ClientRequest))
      } catch (err) {
        fail(err)
      }
    })
    req.on('error', fail)
  })
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' })
  res.end(body)
}

const json = (res: ServerResponse, data: unknown, status = 200) => send(res, status, 'application/json', JSON.stringify(data))

/** A workspace URI from the page (`file:///…`, a POSIX or a Windows path) as a local path. */
export function workspacePath(uri: string): string | undefined {
  if (uri.startsWith('file:')) {
    try {
      return fileURLToPath(uri)
    } catch {
      return undefined
    }
  }
  return uri.includes('://') ? undefined : resolve(uri)
}

const envKey = (plugin: string, key: string) => `${plugin}_${key}`.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()

export function createAgyApp(plugin: Plugin, options: AgyOptions = {}) {
  const env = options.env ?? process.env
  const token = options.token ?? env.ANTIGRAVITY_SIDECAR_UI_TOKEN
  const fs = options.fs ?? nodeFs
  const store = new MemoryStore()
  const panes = new Map<string, PaneState>()
  const streams = new Set<ServerResponse>()
  let version = 0
  let workspace: string | undefined

  store.subscribe(() => {
    version++
    for (const s of streams) s.write(`event: change\ndata: ${version}\n\n`)
  })

  const paneState = (id: string) => {
    const s = panes.get(id) ?? { known: new Map(), handlers: new Map() }
    panes.set(id, s)
    return s
  }

  // Handlers close over the host of the render that drew them but run in a later request: the host
  // reads the request it serves (selection, where effects go) from the async context at call time.
  const requests = new AsyncLocalStorage<{ request: ClientRequest; effects: Effect[] }>()
  const effect = (e: Effect) => requests.getStore()?.effects.push(e)
  const host: Host = {
    harness: 'agy',
    get: a => store.get(a),
    set: (a, next) => store.set(a, next),
    fs,
    cwd: async () => workspace ?? options.cwd ?? process.cwd(),
    config: async key => configValue(env[envKey(plugin.name, key)]) ?? configValue(plugin.config?.[key]?.default),
    selection: async () => {
      const selection = requests.getStore()?.request.selection
      const text = typeof selection === 'string' ? selection : ''
      return text.trim() === '' ? undefined : { text }
    },
    prompt: {
      append: async text => void effect({ type: 'prompt', mode: 'append', text }),
      replace: async text => void effect({ type: 'prompt', mode: 'replace', text }),
      read: async () => '',
      submit: async text => void effect({ type: 'submit', text }),
    },
    toast: message => void effect({ type: 'toast', message }),
    pane: {
      open: async () => true,
      close: async () => {},
      focus: async key => void effect({ type: 'focus', key }),
    },
    scrollTo: async () => {},
  }

  async function render(paneId: string, request: ClientRequest) {
    const pane = plugin.panes?.[paneId]
    if (!pane) throw new Error(`unknown pane ${paneId}`)
    const state = paneState(paneId)
    const onOpen = pane.onOpen
    if (request.initial && onOpen)
      await Promise.resolve()
        .then(() => onOpen(host))
        .catch(err => console.error('onOpen failed:', err))
    const columns = typeof request.columns === 'number' && request.columns > 0 ? Math.floor(request.columns) : 80
    const vp = viewport({ harness: 'agy', surface: 'web', columns, canInput: true })
    const tree = await renderComponent(pane.component, { host, viewport: vp, known: state.known, label: `${plugin.name}/${paneId}` })
    const { html, handlers } = renderHtml(tree)
    state.handlers = handlers
    return html
  }

  function shell(paneId: string, url: URL): string {
    const q = token ? `?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}` : ''
    const title = escapeHtml(plugin.panes?.[paneId]?.title ?? plugin.displayName ?? plugin.name)
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/_bf/style.css${q}">
<script src="/preload.js"></script>
</head>
<body>
<main id="bf-root" data-pane="${escapeHtml(paneId)}"><p class="bf-text bf-dim">Loading…</p></main>
<script src="/_bf/client.js${q}"></script>
</body>
</html>
`
  }

  const authorized = (req: IncomingMessage, url: URL) =>
    !token || req.headers['x-sidecar-token'] === token || url.searchParams.get('token') === token

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    try {
      if (path === '/preload.js') return send(res, 200, 'application/javascript', preloadJs())
      if (!authorized(req, url)) return json(res, { error: 'Unauthorized: missing or invalid sidecar token' }, 401)

      if (req.method === 'GET') {
        if (path === '/api/health') return json(res, { status: 'ok', name: plugin.name, version: plugin.version })
        if (path === '/_bf/client.js') return send(res, 200, 'application/javascript', CLIENT_JS)
        if (path === '/_bf/style.css') return send(res, 200, 'text/css', STYLE_CSS)
        if (path === '/_bf/stream') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
          res.write(`event: hello\ndata: ${version}\n\n`)
          streams.add(res)
          const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
          req.on('close', () => {
            clearInterval(ping)
            streams.delete(res)
          })
          return
        }
        const first = defaultPane(plugin)
        if ((path === '/' || path === '/index.html') && first) return send(res, 200, 'text/html', shell(first, url))
        const m = /^\/pane\/([a-z][a-z0-9-]*)$/.exec(path)
        if (m && plugin.panes?.[m[1]!]) return send(res, 200, 'text/html', shell(m[1]!, url))
      }

      if (req.method === 'POST' && (path === '/_bf/render' || path === '/_bf/event')) {
        const body = await readBody(req)
        const uri = Array.isArray(body.workspaceUris) ? body.workspaceUris.find(u => typeof u === 'string') : undefined
        if (uri) workspace = workspacePath(uri) ?? workspace
        const paneId = typeof body.pane === 'string' ? body.pane : (defaultPane(plugin) ?? '')
        const effects: Effect[] = []
        const html = await requests.run({ request: body, effects }, async () => {
          const handler = path === '/_bf/event' && body.kind ? panes.get(paneId)?.handlers.get(String(body.id))?.[body.kind] : undefined
          if (handler) {
            const run = handler as (value?: string) => unknown
            await Promise.resolve()
              .then(() => run(typeof body.value === 'string' ? body.value : undefined))
              .catch(err => console.error('handler failed:', err))
          }
          return render(paneId, body)
        })
        return json(res, { html, effects, version })
      }
      json(res, { error: 'Not found', path }, 404)
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  return {
    server,
    store,
    start(port = options.port ?? (Number(env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0)): Promise<number> {
      return new Promise((done, fail) => {
        server.once('error', fail)
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address()
          done(typeof addr === 'object' && addr ? addr.port : port)
        })
      })
    },
    stop(): Promise<void> {
      for (const s of streams) s.end()
      streams.clear()
      return new Promise(done => server.close(() => done()))
    },
  }
}

/** Entry of the generated `server.mjs`. */
export async function runAgy(plugin: Plugin, options: AgyOptions = {}): Promise<void> {
  const app = createAgyApp(plugin, options)
  const port = await app.start()
  console.log(`[${plugin.name}] agy pane on 127.0.0.1:${port}`)
  if (options.dev) {
    const self = fileURLToPath(import.meta.url)
    watch(self, () => process.exit(0))
  }
}
