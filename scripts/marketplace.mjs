// pnpm marketplace
// Regenerates .claude-plugin/marketplace.json from plugins/*/.claude-plugin/plugin.json,
// so the repo is installable: /plugin marketplace add <owner>/<repo>, then /plugin install <mod>@<marketplace>
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { c, listMods, manifestOf, ROOT, readJson, writeJson } from './lib.mjs'

const file = join(ROOT, '.claude-plugin', 'marketplace.json')
const prev = existsSync(file) ? readJson(file) : {}

const market = {
  name: prev.name ?? 'claude-mods',
  owner: prev.owner ?? { name: 'gidragir' },
  ...(prev.metadata ? { metadata: prev.metadata } : {}),
  plugins: listMods().map(mod => {
    const m = manifestOf(mod)
    return { name: m.name, source: `./plugins/${mod}`, description: m.description, version: m.version }
  }),
}

mkdirSync(join(ROOT, '.claude-plugin'), { recursive: true })
writeJson(file, market)
console.log(c.green(`✔ marketplace.json: ${market.plugins.map(p => p.name).join(', ') || '(no mods)'}`))
