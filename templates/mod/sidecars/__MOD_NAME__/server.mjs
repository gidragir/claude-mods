import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkIsMain, createSidecarApp } from '@gidragir/bifrost/server'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UI_PATH = join(__dirname, 'ui', 'index.html')
const HTML_CONTENT = existsSync(UI_PATH) ? readFileSync(UI_PATH, 'utf8') : '<h1>__MOD_NAME__</h1>'

export const { server, start } = createSidecarApp({
  name: '__MOD_NAME__',
  uiHtml: HTML_CONTENT,
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
