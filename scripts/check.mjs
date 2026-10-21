// pnpm check [-- <mod> ...] [--only=validate,tsc,test] [--bail]
// For each mod: `claude plugin validate`, `tsc -p`, `claude plugin test`.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { c, claudeVersion, ENGINE_TYPES, listMods, modDir, nameClashes, parseArgs, printClashes, ROOT, run, typesVersion } from './lib.mjs'

const { flags, rest } = parseArgs()
const steps = typeof flags.only === 'string' ? flags.only.split(',') : ['validate', 'tsc', 'test']
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

const hasTests = dir => {
  const walk = d =>
    readdirSync(d, { withFileTypes: true }).some(e =>
      e.isDirectory() ? e.name !== '.claude-plugin' && e.name !== 'node_modules' && walk(join(d, e.name)) : /\.test\.tsx?$/.test(e.name),
    )
  return walk(dir)
}

const results = []
for (const mod of mods) {
  const dir = modDir(mod)
  console.log(c.bold(c.cyan(`\n━━ ${mod}`)))
  for (const step of steps) {
    let code
    if (step === 'validate') code = run('claude', ['plugin', 'validate', dir])
    else if (step === 'tsc') {
      if (!existsSync(join(dir, 'tsconfig.json'))) {
        console.log(c.red('no tsconfig.json'))
        code = 1
      } else code = run(process.execPath, [TSC, '-p', dir])
    } else if (step === 'test') {
      if (!hasTests(dir)) {
        console.log(c.yellow('no *.test.ts — skipped'))
        results.push({ mod, step, status: 'skip' })
        continue
      }
      code = run('claude', ['plugin', 'test', dir])
    } else throw new Error(`unknown step ${step}`)
    results.push({ mod, step, status: code === 0 ? 'ok' : 'fail' })
    if (code !== 0 && flags.bail) break
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
