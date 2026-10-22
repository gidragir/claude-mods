/**
 * Standard Antigravity Sidecar Server infrastructure.
 * Provides HTTP server creation, security token validation, /preload.js injection,
 * static asset serving (Pico CSS, client helper), and Windows realpath normalization.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(__dirname, '..', 'web')
const PICO_CSS_PATH = join(WEB_DIR, 'pico.antigravity.css')
const CLIENT_JS_PATH = join(WEB_DIR, 'client.js')

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

export function getPreloadJs() {
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
export function checkIsMain(importMetaUrl, processArgv1) {
  if (!processArgv1) return false
  const thisFile = fileURLToPath(importMetaUrl)
  try {
    const rThis = realpathSync.native ? realpathSync.native(thisFile) : realpathSync(thisFile)
    const rArg = realpathSync.native ? realpathSync.native(processArgv1) : realpathSync(processArgv1)
    if (process.platform === 'win32') {
      return rArg.toLowerCase() === rThis.toLowerCase()
    }
    return rArg === rThis
  } catch {
    return resolve(thisFile) === resolve(processArgv1)
  }
}

/**
 * Creates a configured HTTP server for an Antigravity Sidecar.
 */
export function createSidecarServer({
  uiHtml = '<h1>Sidecar</h1>',
  routes = {},
  staticFiles = {},
  port = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0,
  token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN,
} = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
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
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid sidecar token' }))
        return
      }
    }

    // 3. Shared web assets
    if (pathname === '/pico.css' || pathname === '/ui/pico.css') {
      if (existsSync(PICO_CSS_PATH)) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        res.end(readFileSync(PICO_CSS_PATH, 'utf8'))
        return
      }
    }
    if (pathname === '/client.js' || pathname === '/ui/client.js') {
      if (existsSync(CLIENT_JS_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
        res.end(readFileSync(CLIENT_JS_PATH, 'utf8'))
        return
      }
    }

    // 4. Custom static files
    if (staticFiles[pathname]) {
      const entry = staticFiles[pathname]
      res.writeHead(200, { 'Content-Type': entry.contentType || 'text/plain; charset=utf-8' })
      res.end(entry.content)
      return
    }

    // 5. Root UI index
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(typeof uiHtml === 'function' ? uiHtml() : uiHtml)
      return
    }

    // 6. Custom route handlers
    const handler = routes[pathname]
    if (handler) {
      try {
        await handler(req, res, url)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  return {
    server,
    start() {
      return new Promise((resolvePromise, rejectPromise) => {
        server.on('error', rejectPromise)
        server.listen(port, '127.0.0.1', () => {
          const addr = server.address()
          const actualPort = typeof addr === 'object' && addr ? addr.port : port
          resolvePromise({ port: actualPort, server })
        })
      })
    },
  }
}
