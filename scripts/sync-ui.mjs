// pnpm ui:sync
// Synchronizes shared UI toolkit files from packages/ui into templates/mod and all plugins,
// guaranteeing that plugins are 100% self-contained when installed via UI / Marketplaces.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { c, listMods, modDir, ROOT } from './lib.mjs'

const UI_PKG = join(ROOT, 'packages', 'ui')
const TUI_SRC = join(UI_PKG, 'tui', 'patterns.tsx')
const CSS_SRC = join(UI_PKG, 'web', 'pico.antigravity.css')
const CLIENT_SRC = join(UI_PKG, 'web', 'client.js')
const SERVER_SRC = join(UI_PKG, 'server', 'sidecar-server.mjs')
const MD_SRC = join(UI_PKG, 'server', 'markdown.mjs')

function copySafe(src, dest) {
  if (!existsSync(src)) return false
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  return true
}

export function syncUiToMod(dir, modName) {
  let count = 0
  // 1. TUI patterns for Claude Code
  const hooksDir = join(dir, 'hooks')
  if (existsSync(hooksDir)) {
    if (copySafe(TUI_SRC, join(hooksDir, 'ui.tsx'))) count++
  }

  // 2. Antigravity Sidecar Webview & Server assets
  const sidecarDir = join(dir, 'sidecars', modName)
  if (existsSync(sidecarDir)) {
    const webVendor = join(sidecarDir, 'ui', 'vendor')
    const srvVendor = join(sidecarDir, 'vendor')
    if (copySafe(CSS_SRC, join(webVendor, 'pico.antigravity.css'))) count++
    if (copySafe(CLIENT_SRC, join(webVendor, 'client.js'))) count++
    if (copySafe(SERVER_SRC, join(srvVendor, 'sidecar-server.mjs'))) count++
    if (copySafe(MD_SRC, join(srvVendor, 'markdown.mjs'))) count++
  }
  return count
}

export function syncAll() {
  console.log(c.bold('Synchronizing UI toolkit to templates and mods...'))

  // 1. Template
  const tmplDir = join(ROOT, 'templates', 'mod')
  const tmplCount = syncUiToMod(tmplDir, '__MOD_NAME__')
  console.log(`  ${c.green('✔')} templates/mod (${tmplCount} files)`)

  // 2. Plugins
  for (const mod of listMods()) {
    const dir = modDir(mod)
    const n = syncUiToMod(dir, mod)
    console.log(`  ${c.green('✔')} plugins/${mod} (${n} files)`)
  }
  console.log(c.green('✔ UI sync complete. All plugins are self-contained.'))
}

syncAll()
