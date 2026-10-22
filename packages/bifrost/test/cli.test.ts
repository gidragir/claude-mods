import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atom, definePlugin } from '@gidragir/bifrost'
import { cleanDist } from '../src/cli/build'
import { claudeEntry, claudeStateModule, fixRegisterExport, scanStateKeys, stateContract, stateKeys } from '../src/cli/codegen'
import { claudeManifest, hooksManifest, panePath, sidecarManifest } from '../src/cli/manifests'

atom('cli-items', [])
const plugin = definePlugin({
  name: 'cli-demo',
  version: '1.2.3',
  description: 'demo',
  config: { prefixes: { type: 'string', title: 'Prefixes', default: '' } },
  panes: { main: { title: 'Main', component: () => null }, extra: { component: () => null } },
})

test('state keys: declared atoms, scanned literals and the config cell', () => {
  expect(scanStateKeys(`useState('query', '')\nconst a = atom("sel", null)\nuseState(name, 1)`)).toEqual(['query', 'sel'])
  const keys = stateKeys(plugin, ['query'])
  expect(keys).toContain('__config')
  expect(keys).toContain('cli-items')
  expect(keys).toContain('query')
})

test('the engine state module names every atom literally', () => {
  const src = claudeStateModule('cli-demo', ['items', 'query'])
  expect(src).toContain('const a0 = atom({ plugin: "cli-demo", key: "items" }, undefined)')
  expect(src).toContain('case "query":\n      return read($, a1)')
  expect(src).toContain('case "items":\n      return update($, a0, fn)')
  expect(src).toContain('export const CELLS = new Set(["items", "query"])')
})

test('register is exported as a const function even after bundling', () => {
  expect(claudeEntry('/p/src/plugin.tsx')).toContain('export const register = (on, options) => install(on, options, plugin)')
  expect(fixRegisterExport('var x = 1;\nvar register = (on) => 1;\nexport { register };')).toBe(
    'var x = 1;\nconst register = (on) => 1;\nexport { register };',
  )
})

test('state contract declares the keys under the plugin name', () => {
  expect(stateContract('cli-demo', ['items', 'my-key'])).toContain('"cli-demo": { items: unknown; "my-key": unknown }')
})

test('manifests: userConfig from config, root defaults, one agy view per pane', () => {
  const m = claudeManifest(plugin, { author: 'someone', license: 'MIT' })
  expect(m.author).toEqual({ name: 'someone' })
  expect(m.license).toBe('MIT')
  expect(m.userConfig).toEqual({ prefixes: { type: 'string', title: 'Prefixes', description: '', default: '' } })
  expect(hooksManifest(true).modules).toEqual(['./index.js', './raw.js'])
  expect(panePath(plugin, 'main')).toBe('/')
  expect(panePath(plugin, 'extra')).toBe('/pane/extra')
  const views = (sidecarManifest(plugin).ui_config as { views: { path: string; title: string }[] }).views
  expect(views.map(v => [v.path, v.title])).toEqual([
    ['/', 'Main'],
    ['/pane/extra', 'extra'],
  ])
})

test('cleaning dist empties a folder a running agy server sits in instead of failing on it', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'bifrost-dist-'))
  const server = join(dist, 'sidecars', 'demo')
  mkdirSync(server, { recursive: true })
  writeFileSync(join(server, 'server.mjs'), '')
  mkdirSync(join(dist, '.claude-plugin', 'types'), { recursive: true })
  writeFileSync(join(dist, '.claude-plugin', 'plugin.json'), '{}')
  writeFileSync(join(dist, '.claude-plugin', 'types', 'engine.d.ts'), '')
  // Windows refuses to remove a directory that is a process's working directory
  const proc = Bun.spawn([process.execPath, '-e', 'setTimeout(() => {}, 10000)'], { cwd: server })
  try {
    await Bun.sleep(100)
    cleanDist(dist)
    expect(existsSync(join(server, 'server.mjs'))).toBe(false)
    expect(existsSync(join(dist, '.claude-plugin', 'plugin.json'))).toBe(false)
    expect(existsSync(join(dist, '.claude-plugin', 'types', 'engine.d.ts'))).toBe(true)
    expect(readdirSync(dist).filter(e => e !== 'sidecars' && e !== '.claude-plugin')).toEqual([])
  } finally {
    proc.kill()
    await proc.exited
    rmSync(dist, { recursive: true, force: true })
  }
})
