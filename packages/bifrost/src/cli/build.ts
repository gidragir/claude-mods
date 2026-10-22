/**
 * `bifrost build`: plugins/<mod>/src → plugins/<mod>/dist, a complete plugin for both harnesses.
 *
 *   dist/.claude-plugin/plugin.json   dist/plugin.json            (Antigravity)
 *   dist/hooks/hooks.json, index.js   dist/sidecars/<mod>/        sidecar.json + server.mjs
 *   dist/types/state.d.ts             dist/skills, rules, tests, README.md, LICENSE
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import type { Plugin } from '../core/plugin'
import { agyEntry, claudeEntry, claudeStateModule, fixRegisterExport, scanStateKeys, stateContract, stateKeys } from './codegen'
import { agyManifest, claudeManifest, type Defaults, hooksManifest, sidecarManifest } from './manifests'

export const ENTRY = join('src', 'plugin.tsx')

const JSX: esbuild.BuildOptions = { jsx: 'automatic', jsxImportSource: '@gidragir/bifrost' }
const STATE_MODULE = 'virtual:bifrost/claude-state'

const writeJson = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const posix = (p: string) => p.split('\\').join('/')

function walk(dir: string, filter: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p, filter) : filter(p) ? [p] : []
  })
}

/** The repository root: the nearest folder up with a pnpm-workspace.yaml (or the plugin's parent's parent). */
export function findRoot(from: string): string {
  let dir = resolve(from)
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) return resolve(from, '..', '..')
    dir = up
  }
}

function rootDefaults(root: string): Defaults {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    return { author: pkg.author, license: pkg.license, ...(repo ? { repository: String(repo).replace(/^git\+|\.git$/g, '') } : {}) }
  } catch {
    return {}
  }
}

/** Evaluates `src/plugin.tsx` in this process to read its definition (atoms, panes, commands). */
export async function loadPlugin(modDir: string): Promise<Plugin> {
  const entry = join(modDir, ENTRY)
  if (!existsSync(entry)) throw new Error(`no ${posix(ENTRY)} in ${modDir}`)
  // evaluated from a cache folder, so nothing but the plugin itself lands in dist; a fresh file name
  // per build, because runtimes cache modules by path (Bun ignores a ?query)
  const out = join(findRoot(modDir), 'node_modules', '.cache', 'bifrost', `${basename(resolve(modDir))}-${Date.now()}.mjs`)
  await esbuild.build({ ...JSX, entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' })
  const mod = await import(pathToFileURL(out).href).finally(() => rmSync(out, { force: true }))
  const plugin = mod.default as Plugin | undefined
  if (!plugin?.name || !Array.isArray(plugin.atoms)) throw new Error(`${posix(ENTRY)} must \`export default definePlugin({ … })\``)
  return plugin
}

function stateModulePlugin(contents: string): esbuild.Plugin {
  return {
    name: 'bifrost-claude-state',
    setup(b) {
      b.onResolve({ filter: /^virtual:bifrost\/claude-state$/ }, () => ({ path: STATE_MODULE, namespace: 'bifrost' }))
      b.onLoad({ filter: /.*/, namespace: 'bifrost' }, () => ({ contents, loader: 'js', resolveDir: process.cwd() }))
    },
  }
}

async function bundleHooks(entry: string, resolveDir: string, outfile: string, plugins: esbuild.Plugin[] = []) {
  const result = await esbuild.build({
    ...JSX,
    stdin: { contents: entry, resolveDir, loader: 'js', sourcefile: 'register.js' },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2023',
    external: ['claude-code', 'claude-code/*'],
    plugins,
    write: false,
    logLevel: 'silent',
  })
  mkdirSync(dirname(outfile), { recursive: true })
  writeFileSync(outfile, fixRegisterExport(result.outputFiles[0]!.text))
}

/** Removes `path`; a directory that cannot go (a running agy server's cwd on Windows) is emptied and kept. */
function remove(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true })
  } catch (err) {
    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) throw err
    for (const e of readdirSync(path)) remove(join(path, e))
  }
}

/** Empties `dist`, except .claude-plugin/types (the engine lays them there on load). */
export function cleanDist(dist: string): void {
  for (const e of existsSync(dist) ? readdirSync(dist) : []) if (e !== '.claude-plugin') remove(join(dist, e))
  rmSync(join(dist, '.claude-plugin', 'plugin.json'), { force: true })
}

export interface BuildOptions {
  dev?: boolean
  log?: (line: string) => void
}

export interface BuildResult {
  plugin: Plugin
  dist: string
  stateKeys: string[]
}

export async function buildPlugin(modDir: string, { dev = false, log = () => {} }: BuildOptions = {}): Promise<BuildResult> {
  const dir = resolve(modDir)
  const root = findRoot(dir)
  const dist = join(dir, 'dist')
  const plugin = await loadPlugin(dir)
  const scanned = walk(join(dir, 'src'), f => /\.tsx?$/.test(f)).flatMap(f => scanStateKeys(readFileSync(f, 'utf8')))
  const keys = stateKeys(plugin, scanned)

  cleanDist(dist)

  const pluginPath = posix(join(dir, ENTRY))
  if (plugin.targets.includes('claude')) {
    writeJson(join(dist, '.claude-plugin', 'plugin.json'), claudeManifest(plugin, rootDefaults(root)))
    const raw = join(dir, 'src', 'claude.ts')
    writeJson(join(dist, 'hooks', 'hooks.json'), hooksManifest(existsSync(raw)))
    mkdirSync(join(dist, 'types'), { recursive: true })
    writeFileSync(join(dist, 'types', 'state.d.ts'), stateContract(plugin.name, keys))
    await bundleHooks(claudeEntry(pluginPath), dir, join(dist, 'hooks', 'index.js'), [
      stateModulePlugin(claudeStateModule(plugin.name, keys)),
    ])
    if (existsSync(raw)) await bundleHooks(`export { register } from ${JSON.stringify(posix(raw))}`, dir, join(dist, 'hooks', 'raw.js'))
    for (const test of walk(join(dir, 'test', 'engine'), f => /\.tsx?$/.test(f))) {
      const name = relative(join(dir, 'test', 'engine'), test).replace(/\.(tsx?)$/, '.test.$1')
      mkdirSync(dirname(join(dist, 'tests', name)), { recursive: true })
      cpSync(test, join(dist, 'tests', name))
    }
    log('claude  → dist/hooks/index.js')
  }

  if (plugin.targets.includes('agy')) {
    writeJson(join(dist, 'plugin.json'), agyManifest(plugin))
    const serverDir = join(dist, 'sidecars', plugin.name)
    writeJson(join(serverDir, 'sidecar.json'), sidecarManifest(plugin))
    await esbuild.build({
      ...JSX,
      stdin: { contents: agyEntry(pluginPath, dev), resolveDir: dir, loader: 'js', sourcefile: 'server.js' },
      outfile: join(serverDir, 'server.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      logLevel: 'silent',
    })
    log(`agy     → dist/sidecars/${plugin.name}/server.mjs`)
  }

  for (const folder of ['skills', 'rules', 'docs'])
    if (existsSync(join(dir, folder))) cpSync(join(dir, folder), join(dist, folder), { recursive: true })
  for (const [file, fallback] of [
    ['README.md', undefined],
    ['LICENSE', join(root, 'LICENSE')],
  ] as const) {
    const from = existsSync(join(dir, file)) ? join(dir, file) : fallback
    if (from && existsSync(from) && statSync(from).isFile()) cpSync(from, join(dist, file))
  }
  return { plugin, dist, stateKeys: keys }
}
