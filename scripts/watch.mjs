// pnpm watch [-- <mod> ...]
// On save, re-runs tsc + tests for the mod that changed (validate too with --validate).
// The engine itself hot-reloads linked mods in sessions; this is the fast feedback loop beside it.
import { watch } from 'node:fs'
import { join, sep } from 'node:path'
import { c, listMods, PLUGINS, parseArgs, ROOT, run } from './lib.mjs'

const { flags, rest } = parseArgs()
const mods = new Set(listMods(rest))
const only = flags.validate ? 'validate,tsc,test' : 'tsc,test'
const pending = new Set()
let timer

// run() is synchronous: events that arrive during a run are delivered after it.
const flush = () => {
  const batch = [...pending]
  pending.clear()
  if (batch.length === 0) return
  if (process.stdout.isTTY) console.clear()
  console.log(c.dim(`${new Date().toLocaleTimeString()}  ${batch.join(', ')}`))
  run(process.execPath, [join(ROOT, 'scripts', 'check.mjs'), `--only=${only}`, ...batch])
  console.log(c.dim('\nwatching… (ctrl+c to stop)'))
}

watch(PLUGINS, { recursive: true }, (_ev, file) => {
  if (!file) return
  const parts = file.split(sep)
  const mod = parts[0]
  if (!mod || !mods.has(mod) || (parts.includes('.claude-plugin') && parts.includes('types'))) return
  if (!/\.(tsx?|jsx?|mjs|cjs|json|d\.ts)$/.test(file)) return
  pending.add(mod)
  clearTimeout(timer)
  timer = setTimeout(flush, 250)
})

console.log(c.cyan(`watching ${[...mods].join(', ')} — ${only}`))
