import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { c, listMods, modDir, ROOT, run } from './lib.mjs'

const BIFROST_PKG = join(ROOT, 'packages', 'bifrost')
const TUI_SRC = join(BIFROST_PKG, 'src', 'ui', 'tui', 'patterns.tsx')
const CSS_SRC = join(BIFROST_PKG, 'src', 'ui', 'web', 'pico.antigravity.css')
const CLIENT_SRC = join(BIFROST_PKG, 'dist', 'ui', 'web', 'client.js')

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

  // 2. Antigravity Sidecar Webview assets
  const sidecarDir = join(dir, 'sidecars', modName)
  if (existsSync(sidecarDir)) {
    const webVendor = join(sidecarDir, 'ui', 'vendor')
    if (copySafe(CSS_SRC, join(webVendor, 'pico.antigravity.css'))) count++
    if (copySafe(CLIENT_SRC, join(webVendor, 'client.js'))) count++
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

  // 3. Format vendored files to meet repo lint rules
  run('pnpm', ['biome', 'check', '--write', 'templates/mod/sidecars', 'plugins'], {
    cwd: ROOT,
    stdio: 'ignore',
  })

  console.log(c.green('✔ UI sync complete. All plugins are self-contained.'))
}

syncAll()
