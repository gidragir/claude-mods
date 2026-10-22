import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Self-contained imports from vendor/ (updated via pnpm ui:sync)
import { checkIsMain, createSidecarServer } from './vendor/sidecar-server.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UI_PATH = join(__dirname, 'ui', 'index.html')
const HTML_CONTENT = existsSync(UI_PATH) ? readFileSync(UI_PATH, 'utf8') : '<h1>__MOD_NAME__</h1>'

const PICO_PATH = join(__dirname, 'ui', 'vendor', 'pico.antigravity.css')
const CLIENT_PATH = join(__dirname, 'ui', 'vendor', 'client.js')

export const { server, start } = createSidecarServer({
  uiHtml: HTML_CONTENT,
  staticFiles: {
    '/pico.css': {
      contentType: 'text/css; charset=utf-8',
      content: existsSync(PICO_PATH) ? readFileSync(PICO_PATH, 'utf8') : '',
    },
    '/client.js': {
      contentType: 'application/javascript; charset=utf-8',
      content: existsSync(CLIENT_PATH) ? readFileSync(CLIENT_PATH, 'utf8') : '',
    },
  },
  routes: {
    '/api/status': (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', mod: '__MOD_NAME__' }))
    },
  },
})

if (checkIsMain(import.meta.url, process.argv[1])) {
  start().then(({ port }) => {
    console.log(`[__MOD_NAME__-sidecar] Listening on 127.0.0.1:${port}`)
  })
}
