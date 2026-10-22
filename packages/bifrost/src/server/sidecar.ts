/**
 * Antigravity Sidecar Server infrastructure for Bifrost plugins.
 * Manages HTTP daemon lifecycle, token verification, /preload.js injection,
 * static asset serving, Windows junction resolution, and custom JSON/SSR endpoints.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function findAssetPath(filename: string, customPath?: string): string {
  if (customPath && existsSync(customPath)) return customPath
  const candidates = [
    join(__dirname, 'ui', 'web', filename),
    join(__dirname, '..', 'dist', 'ui', 'web', filename),
    join(__dirname, '..', 'ui', 'web', filename),
    join(__dirname, '..', 'src', 'ui', 'web', filename),
    join(process.cwd(), 'ui', 'vendor', filename),
    join(process.cwd(), 'ui', filename),
    join(process.cwd(), 'vendor', filename),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return ''
}

const FALLBACK_PRELOAD = `
(function() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const conversationId = params.get('conversationId');

  let currentWorkspaceUris = [];
  const workspaceListeners = new Set();

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'theme-change') {
      const vars = event.data.payload?.cssVariables || {};
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value);
      }
    } else if (event.data?.type === 'workspace-change') {
      const payload = event.data.payload || {};
      currentWorkspaceUris = Array.isArray(payload.workspaceUris) ? [...payload.workspaceUris] : [];
      for (const listener of workspaceListeners) {
        try { listener([...currentWorkspaceUris]); } catch (e) { console.error(e); }
      }
    }
  });

  window.sidecar = {
    conversationId,
    fetch: function(url, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      if (token) opts.headers['X-Sidecar-Token'] = token;
      return fetch(url, opts);
    },
    getWorkspaceUris: async function() { return [...currentWorkspaceUris]; },
    onWorkspaceChange: function(listener) {
      if (typeof listener === 'function') {
        workspaceListeners.add(listener);
        if (currentWorkspaceUris.length > 0) {
          queueMicrotask(() => listener([...currentWorkspaceUris]));
        }
      }
      return () => workspaceListeners.delete(listener);
    }
  };
})();
`

/**
 * Returns the preload script for the Antigravity webview auxiliary pane.
 */
export function getPreloadJs(): string {
  const candidates = [
    join(homedir(), '.gemini', 'config', 'node_modules', 'sidecar_sdk', 'preload.js'),
    join(homedir(), '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return FALLBACK_PRELOAD
}

/**
 * Windows junction & case-insensitive main module check.
 */
export function checkIsMain(importMetaUrl: string, processArgv1?: string): boolean {
  if (!processArgv1 || !importMetaUrl) return false
  const thisFile = importMetaUrl.startsWith('file:') ? fileURLToPath(importMetaUrl) : importMetaUrl
  try {
    const rThis = realpathSync.native ? realpathSync.native(thisFile) : realpathSync(thisFile)
    const rArg = realpathSync.native ? realpathSync.native(processArgv1) : realpathSync(processArgv1)
    if (process.platform === 'win32') {
      return rArg.toLowerCase() === rThis.toLowerCase()
    }
    return rArg === rThis
  } catch {
    const r1 = resolve(thisFile)
    const r2 = resolve(processArgv1)
    if (process.platform === 'win32') {
      return r1.toLowerCase() === r2.toLowerCase()
    }
    return r1 === r2
  }
}

export type RouteHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void

export interface SidecarAppOptions {
  name?: string
  uiHtml?: string | (() => string)
  routes?: Record<string, RouteHandler>
  staticFiles?: Record<string, { contentType: string; content: string | Buffer }>
  port?: number
  token?: string
  picoCssPath?: string
  clientJsPath?: string
}

/**
 * Helper to reply with JSON.
 */
export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

/**
 * Creates and configures an Antigravity Sidecar HTTP server.
 */
export function createSidecarApp(options: SidecarAppOptions = {}) {
  const {
    name = 'sidecar',
    uiHtml = `<h1>${name}</h1>`,
    routes = {},
    staticFiles = {},
    port = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0,
    token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN,
    picoCssPath,
    clientJsPath,
  } = options

  const server = createServer(async (req, res) => {
    const hostHeader = req.headers.host || 'localhost'
    const url = new URL(req.url ?? '/', `http://${hostHeader}`)
    const pathname = url.pathname

    // 1. Preload script is exempt from token check
    if (pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(getPreloadJs())
      return
    }

    // 2. Token verification
    if (token) {
      const authHeader = req.headers['x-sidecar-token']
      const queryToken = url.searchParams.get('token')
      if (authHeader !== token && queryToken !== token) {
        sendJson(res, { error: 'Unauthorized: missing or invalid sidecar token' }, 401)
        return
      }
    }

    // 3. Shared web assets
    if (pathname === '/pico.css' || pathname === '/ui/pico.css') {
      const resolvedPico = findAssetPath('pico.antigravity.css', picoCssPath)
      if (resolvedPico) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        res.end(readFileSync(resolvedPico, 'utf8'))
        return
      }
    }
    if (pathname === '/client.js' || pathname === '/ui/client.js') {
      const resolvedClient = findAssetPath('client.js', clientJsPath)
      if (resolvedClient) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
        res.end(readFileSync(resolvedClient, 'utf8'))
        return
      }
    }

    // 4. Custom static files
    const staticEntry = staticFiles[pathname]
    if (staticEntry) {
      res.writeHead(200, { 'Content-Type': staticEntry.contentType })
      res.end(staticEntry.content)
      return
    }

    // 5. Root UI index
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(typeof uiHtml === 'function' ? uiHtml() : uiHtml)
      return
    }

    // 6. Health & status endpoint
    if (pathname === '/api/health') {
      sendJson(res, { status: 'ok', name, uptime: process.uptime() })
      return
    }

    // 7. Custom route handlers
    const handler = routes[pathname]
    if (handler) {
      try {
        await handler(req, res, url)
      } catch (err) {
        sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 500)
      }
      return
    }

    // 8. 404 Not Found
    sendJson(res, { error: 'Not found', path: pathname }, 404)
  })

  return {
    server,
    start(): Promise<{ port: number; server: typeof server }> {
      return new Promise((resolvePromise, rejectPromise) => {
        server.on('error', rejectPromise)
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address()
          const actualPort = typeof addr === 'object' && addr ? addr.port : port
          resolvePromise({ port: actualPort, server })
        })
      })
    },
    stop(): Promise<void> {
      return new Promise((resolvePromise, rejectPromise) => {
        server.close(err => (err ? rejectPromise(err) : resolvePromise()))
      })
    },
  }
}

export const createSidecarServer = createSidecarApp
