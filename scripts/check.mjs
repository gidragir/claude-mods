// pnpm check [-- <mod> ...] [--only=build,validate,tsc,test] [--bail]
// For each mod: `bifrost build`, `claude plugin validate dist`, `tsc -p` (source), `claude plugin test dist`.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  bifrost,
  c,
  claudeVersion,
  distDir,
  ENGINE_TYPES,
  listMods,
  modDir,
  nameClashes,
  parseArgs,
  printClashes,
  ROOT,
  run,
  typesVersion,
} from './lib.mjs'

const { flags, rest } = parseArgs()
const steps = typeof flags.only === 'string' ? flags.only.split(',') : ['build', 'validate', 'tsc', 'test']
const mods = listMods(rest)
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')

if (mods.length === 0) {
  console.log(c.yellow('No mods in plugins/. Create one: pnpm new <name>'))
  process.exit(0)
}

const vendored = typesVersion(join(ENGINE_TYPES, 'claude-code', 'index.d.ts'))
const cli = claudeVersion()
if (steps.includes('tsc')) {
  if (!vendored) {
    console.log(c.red('types/engine is empty: run `pnpm types:sync` first.'))
    process.exit(1)
  }
  if (cli && vendored !== cli) console.log(c.yellow(`! engine types are ${vendored}, CLI is ${cli}: consider \`pnpm types:sync\``))
}

if (steps.includes('validate')) printClashes(nameClashes(mods))

const results = []
for (const mod of mods) {
  const dist = distDir(mod)
  console.log(c.bold(c.cyan(`\n━━ ${mod}`)))
  for (const step of steps) {
    let code
    if (step === 'build') code = bifrost('build', [mod])
    else if (step === 'validate') code = run('claude', ['plugin', 'validate', dist])
    else if (step === 'tsc') {
      // the plugin's code, then its tests (test/tsconfig.json adds Bun's types)
      const tests = join(modDir(mod), 'test', 'tsconfig.json')
      code = run(process.execPath, [TSC, '-p', modDir(mod)]) || (existsSync(tests) ? run(process.execPath, [TSC, '-p', tests]) : 0)
    } else if (step === 'test') {
      if (!existsSync(join(dist, 'tests'))) {
        console.log(c.yellow('no test/engine/*.ts — skipped'))
        results.push({ mod, step, status: 'skip' })
        continue
      }
      code = run('claude', ['plugin', 'test', dist])
    } else throw new Error(`unknown step ${step}`)
    results.push({ mod, step, status: code === 0 ? 'ok' : 'fail' })
    if (code !== 0 && (flags.bail || step === 'build')) break
  }
}

console.log(c.bold('\nSummary'))
for (const mod of mods) {
  const line = results
    .filter(r => r.mod === mod)
    .map(r => (r.status === 'ok' ? c.green(`✔ ${r.step}`) : r.status === 'skip' ? c.dim(`– ${r.step}`) : c.red(`✘ ${r.step}`)))
    .join('  ')
  console.log(`  ${mod.padEnd(24)} ${line}`)
}
process.exit(results.some(r => r.status === 'fail') ? 1 : 0)
