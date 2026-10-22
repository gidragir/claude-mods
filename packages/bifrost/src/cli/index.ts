/**
 * The `bifrost` command.
 *
 *   bifrost build [dir ...]   build plugins into <dir>/dist
 *   bifrost dev   [dir ...]   build, then rebuild on every save (linked sessions hot-reload)
 *
 * Without a dir: the current folder when it holds src/plugin.tsx, else every plugin under ./plugins.
 */

import { existsSync, readdirSync, watch } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { buildPlugin, ENTRY } from './build'

const tty = process.stdout.isTTY
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = paint(32)
const red = paint(31)
const dim = paint(2)

export function resolveTargets(args: string[], cwd = process.cwd()): string[] {
  if (args.length > 0)
    return args.map(a => {
      const dir = existsSync(join(cwd, a, ENTRY)) ? resolve(cwd, a) : resolve(cwd, 'plugins', a)
      if (!existsSync(join(dir, ENTRY))) throw new Error(`no plugin at ${a} (expected ${ENTRY})`)
      return dir
    })
  if (existsSync(join(cwd, ENTRY))) return [resolve(cwd)]
  const plugins = join(cwd, 'plugins')
  return existsSync(plugins)
    ? readdirSync(plugins, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(join(plugins, d.name, ENTRY)))
        .map(d => join(plugins, d.name))
    : []
}

async function buildOne(dir: string, dev: boolean): Promise<boolean> {
  const started = Date.now()
  const lines: string[] = []
  try {
    const { plugin } = await buildPlugin(dir, { dev, log: line => lines.push(dim(`  ${line}`)) })
    console.log([`${green('✔')} ${plugin.name}@${plugin.version} ${dim(`${Date.now() - started} ms`)}`, ...lines].join('\n'))
    return true
  } catch (err) {
    console.log(`${red('✘')} ${basename(dir)}: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

function watchPlugin(dir: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = Promise.resolve(true)
  const rebuild = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      running = running.then(() => buildOne(dir, true))
    }, 120)
  }
  for (const sub of ['src', 'skills', 'rules', 'test']) {
    const p = join(dir, sub)
    if (existsSync(p)) watch(p, { recursive: true }, rebuild)
  }
  watch(dir, (_e, file) => file === 'README.md' && rebuild())
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const [cmd = 'build', ...rest] = argv
  if (cmd !== 'build' && cmd !== 'dev') {
    console.log('usage: bifrost build|dev [plugin-dir ...]')
    return 1
  }
  const dirs = resolveTargets(rest)
  if (dirs.length === 0) {
    console.log(red(`no plugins found (looked for ${ENTRY})`))
    return 1
  }
  const dev = cmd === 'dev'
  const ok = (await Promise.all(dirs.map(d => buildOne(d, dev)))).every(Boolean)
  if (!dev) return ok ? 0 : 1
  for (const d of dirs) watchPlugin(d)
  console.log(dim('watching for changes… (ctrl+c to stop)'))
  return new Promise(() => {})
}
