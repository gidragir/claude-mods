/**
 * Antigravity Sidecar Server for ref-pane built on @gidragir/bifrost.
 * Serves the webview UI in the Auxiliary Pane and resolves artifact references
 * using the shared pure TypeScript core (hooks/refs.ts).
 */

import { existsSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkIsMain as bifrostCheckIsMain, createSidecarApp } from '@gidragir/bifrost/server'
import { renderMarkdown } from '@gidragir/bifrost/ui'

// Shared pure core imported directly via Node 24 type stripping
import { findIds, HOME, parsePrefixes, resolveRefs, rootsIn } from '../../hooks/refs.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UI_INDEX_PATH = join(__dirname, 'ui', 'index.html')
const HTML_CONTENT = existsSync(UI_INDEX_PATH) ? readFileSync(UI_INDEX_PATH, 'utf8') : '<h1>Refs Pane</h1>'

export const nodeFs = {
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

async function handleRefsRoute(req, res, url) {
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
          discovered.size > 0 ? Array.from(discovered) : fallbackList.length > 0 ? fallbackList : ['RV-001', 'FB-001', 'T-001', 'ADR-001']
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
}

export function createSidecarHandler({ token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN } = {}) {
  const app = createSidecarApp({
    name: 'ref-pane',
    token,
    uiHtml: HTML_CONTENT,
    routes: {
      '/api/refs': handleRefsRoute,
    },
  })
  return (req, res) => app.server.emit('request', req, res)
}

export function startServer(port = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || '0', 10)) {
  const app = createSidecarApp({
    name: 'ref-pane',
    port,
    uiHtml: HTML_CONTENT,
    routes: {
      '/api/refs': handleRefsRoute,
    },
  })

  return app.start().then(({ port: actualPort, server }) => {
    console.log(`[ref-pane-sidecar] Listening on 127.0.0.1:${actualPort}`)
    return { server, port: actualPort }
  })
}

export function checkIsMain(argvPath = process.argv[1], metaUrl = import.meta.url) {
  if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) return true
  return bifrostCheckIsMain(metaUrl, argvPath)
}

const isMain = checkIsMain()
if (isMain) {
  startServer().catch(err => {
    console.error('[ref-pane-sidecar] Failed to start:', err)
    process.exit(1)
  })
}
