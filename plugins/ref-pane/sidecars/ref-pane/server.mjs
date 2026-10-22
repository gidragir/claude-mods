/**
 * Antigravity Sidecar Server for ref-pane.
 * Serves the webview UI in the Auxiliary Pane and resolves artifact references
 * using the shared pure TypeScript core (hooks/refs.ts).
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Shared pure core imported directly via Node 24 type stripping
import { findIds, HOME, parsePrefixes, resolveRefs, rootsIn } from '../../hooks/refs.ts'
import { renderMarkdown } from './markdown.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UI_INDEX_PATH = join(__dirname, 'ui', 'index.html')
const HTML_CONTENT = existsSync(UI_INDEX_PATH) ? readFileSync(UI_INDEX_PATH, 'utf8') : '<h1>Refs Pane</h1>'

// Fallback preload script if sidecar_sdk is not available in environment
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
    },
    agent: {
      sendMessage: async function(message, convId) {
        return window.sidecar.fetch('/_sidecar/send-message', {
          method: 'POST',
          body: JSON.stringify({ conversationId: convId || conversationId, message })
        }).catch(() => null);
      }
    }
  };
})();
`

function getPreloadJs() {
  const candidates = [
    join(homedir(), '.gemini', 'config', 'node_modules', 'sidecar_sdk', 'preload.js'),
    join(homedir(), '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return FALLBACK_PRELOAD
}

const nodeFs = {
  async list(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return await Promise.all(
        entries.map(async e => {
          let mtimeMs = 0
          try {
            const st = await fs.stat(join(dir, e.name))
            mtimeMs = st.mtimeMs
          } catch {}
          return {
            name: e.name,
            kind: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
            mtimeMs,
          }
        }),
      )
    } catch {
      return []
    }
  },
  async read(filePath) {
    return fs.readFile(filePath, 'utf8')
  },
}

export function createSidecarHandler({ token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN } = {}) {
  const preloadJs = getPreloadJs()

  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')

    // Token verification
    if (token && url.pathname !== '/preload.js') {
      const provided = req.headers['x-sidecar-token'] || url.searchParams.get('token')
      if (provided !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }
    }

    if (req.method === 'GET' && url.pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' })
      res.end(preloadJs)
      return
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(HTML_CONTENT)
      return
    }

    if (url.pathname === '/api/refs') {
      let body = ''
      req.on('data', chunk => {
        body += chunk
      })
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {}
          const query = payload.query || url.searchParams.get('query') || ''
          const workspaceUris = payload.workspaceUris || []

          let cwd = process.cwd()
          if (workspaceUris.length > 0 && typeof workspaceUris[0] === 'string') {
            const first = workspaceUris[0]
            if (first.startsWith('file://')) {
              try {
                cwd = fileURLToPath(first)
              } catch {}
            } else if (!first.includes('://')) {
              cwd = resolve(first)
            }
          }

          let prefixes = HOME
          const rawPrefixes = payload.prefixes || url.searchParams.get('prefixes') || process.env.REFS_PREFIXES
          if (rawPrefixes) {
            const custom =
              typeof rawPrefixes === 'string'
                ? parsePrefixes(rawPrefixes)
                : parsePrefixes(
                    Object.entries(rawPrefixes)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(','),
                  )
            if (Object.keys(custom).length > 0) prefixes = custom
          }

          const ids = findIds(query, prefixes)
          const roots = rootsIn(query)

          let searchIds = ids
          if (searchIds.length === 0) {
            // Scan docs/ and features/ in cwd and roots to auto-discover reference IDs in markdown files
            const candidateDirs = [join(cwd, 'docs')]
            try {
              const featEntries = await nodeFs.list(join(cwd, 'features'))
              for (const feat of featEntries) {
                if (feat.kind === 'dir') {
                  for (const dirName of Object.values(prefixes)) {
                    candidateDirs.push(join(cwd, 'features', feat.name, dirName))
                  }
                }
              }
            } catch {}
            const discovered = new Set()
            for (const d of candidateDirs) {
              const entries = await nodeFs.list(d)
              for (const e of entries) {
                if (e.kind === 'file' && e.name.endsWith('.md')) {
                  const content = await nodeFs.read(join(d, e.name)).catch(() => '')
                  for (const id of findIds(content, prefixes)) {
                    discovered.add(id)
                  }
                }
              }
            }
            const fallbackList = Object.keys(prefixes)
              .slice(0, 4)
              .map(p => `${p}-001`)
            searchIds =
              discovered.size > 0
                ? Array.from(discovered)
                : fallbackList.length > 0
                  ? fallbackList
                  : ['RV-001', 'FB-001', 'T-001', 'ADR-001']
          }

          let refs = await resolveRefs(nodeFs, cwd, searchIds, query, roots, prefixes)

          // If query has non-empty text without IDs, filter resolved refs matching text
          const trimmedQuery = query.trim()
          if (trimmedQuery && ids.length === 0) {
            const lower = trimmedQuery.toLowerCase()
            refs = refs.filter(r => r.id.toLowerCase().includes(lower) || r.text.toLowerCase().includes(lower))
          }

          // Server-Side Rendering: Attach pre-rendered, sanitized HTML for each ref
          const enrichedRefs = refs.map(r => ({
            ...r,
            html: renderMarkdown(r.text || ''),
          }))

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ refs: enrichedRefs, cwd, roots }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

export function startServer(port = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || '0', 10)) {
  const handler = createSidecarHandler()
  const server = createServer(handler)

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port
      console.log(`[ref-pane-sidecar] Listening on 127.0.0.1:${actualPort}`)
      resolve({ server, port: actualPort })
    })
    server.on('error', reject)
  })
}

export function checkIsMain(argvPath = process.argv[1], metaUrl = import.meta.url) {
  if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) return true
  if (!argvPath) return false
  const thisFile = fileURLToPath(metaUrl)
  const argFile = resolve(argvPath)
  if (argFile === resolve(thisFile)) return true
  if (process.platform === 'win32' && argFile.toLowerCase() === resolve(thisFile).toLowerCase()) return true
  try {
    if (existsSync(argFile) && existsSync(thisFile)) {
      const realThis = realpathSync.native ? realpathSync.native(thisFile) : realpathSync(thisFile)
      const realArg = realpathSync.native ? realpathSync.native(argFile) : realpathSync(argFile)
      if (realArg === realThis) return true
      if (process.platform === 'win32' && realArg.toLowerCase() === realThis.toLowerCase()) return true
    }
  } catch {}
  return false
}

const isMain = checkIsMain()
if (isMain) {
  startServer().catch(err => {
    console.error('[ref-pane-sidecar] Failed to start:', err)
    process.exit(1)
  })
}
