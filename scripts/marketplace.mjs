// pnpm marketplace
// Builds every mod, then regenerates:
//   .claude-plugin/marketplace.json  each plugin from its release branch (release/<mod>, built by CI), so
//                                    /plugin marketplace add <owner>/<repo> + /plugin install <mod>@<marketplace> works
//   .agents/plugins.json             Antigravity workspace discovery of the local builds (plugins/<mod>/dist)
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { bifrost, c, listMods, manifestOf, ROOT, readJson, writeJson } from './lib.mjs'

const mods = listMods()
if (mods.length > 0 && bifrost('build', mods, { stdio: 'ignore' }) !== 0) {
  console.log(c.red('build failed: run `pnpm build` to see why'))
  process.exit(1)
}

const file = join(ROOT, '.claude-plugin', 'marketplace.json')
const prev = existsSync(file) ? readJson(file) : {}
const repo = (readJson(join(ROOT, 'package.json')).repository ?? 'https://github.com/gidragir/claude-mods').replace(/^git\+|\.git$/g, '')

const market = {
  name: prev.name ?? 'claude-mods',
  owner: prev.owner ?? { name: 'gidragir' },
  ...(prev.metadata ? { metadata: prev.metadata } : {}),
  plugins: mods.map(mod => {
    const m = manifestOf(mod)
    return {
      name: m.name,
      source: { source: 'url', url: `${repo}.git`, ref: `release/${mod}` },
      description: m.description,
      version: m.version,
    }
  }),
}

mkdirSync(join(ROOT, '.claude-plugin'), { recursive: true })
writeJson(file, market)
writeJson(join(ROOT, '.agents', 'plugins.json'), { entries: mods.map(mod => ({ path: `plugins/${mod}/dist` })) })
console.log(c.green(`✔ marketplace.json, .agents/plugins.json: ${mods.join(', ') || '(no mods)'}`))
