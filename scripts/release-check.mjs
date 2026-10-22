// pnpm release:check
// Before pushing release tags: replays the CI release steps on a clean clone of HEAD (no node_modules, no
// types/engine, no dist), checks versions against the last tags, CHANGELOG and marketplace.json, and lints
// the workflows with actionlint when it is installed. Prints the tags to push.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { c, capture, cmpVer, listMods, ROOT, readJson, run } from './lib.mjs'

const problems = []
const fail = msg => {
  problems.push(msg)
  console.log(`${c.red('✘')} ${msg}`)
}
const ok = msg => console.log(`${c.green('✔')} ${msg}`)
const git = (...args) => capture('git', ['-C', ROOT, ...args])

if (git('status', '--porcelain')) {
  console.log(c.red('✘ uncommitted changes: the check runs on a clone of HEAD, commit first'))
  process.exit(1)
}

// --- the CI steps, on a fresh clone ---
const clone = mkdtempSync(join(tmpdir(), 'release-check-'))
const step = (title, cmd, args, cwd = clone) => {
  console.log(c.dim(`\n$ ${[cmd, ...args].join(' ')}`))
  if (run(cmd, args, { cwd }) === 0) ok(title)
  else fail(`${title} failed on a clean clone (CI would fail too)`)
}
const mods = listMods()
try {
  step('clone', 'git', ['clone', '--quiet', '--no-hardlinks', ROOT, clone], ROOT)
  step('bun install', 'bun', ['install'])
  step('bun test', 'bun', ['test'])
  for (const mod of mods) step(`build ${mod}`, 'bun', ['packages/bifrost/src/cli/bin.ts', 'build', `plugins/${mod}`])
  step('build @gidragir/bifrost', 'node', ['build.mjs'], join(clone, 'packages', 'bifrost'))
} finally {
  rmSync(clone, { recursive: true, force: true })
}

// --- versions ---
console.log('')
const lastTag = prefix =>
  (git('tag', '-l', `${prefix}-v*`) ?? '')
    .split('\n')
    .filter(Boolean)
    .map(t => t.slice(prefix.length + 2))
    .sort(cmpVer)
    .at(-1)
const toTag = []
const checkVersion = (prefix, version, paths) => {
  const last = lastTag(prefix)
  const changed = !last || git('diff', '--quiet', `${prefix}-v${last}`, 'HEAD', '--', ...paths) === undefined
  if (last && cmpVer(version, last) < 0) fail(`${prefix} ${version} is older than the tag ${prefix}-v${last}`)
  else if (last === version && changed) fail(`${prefix} changed since ${prefix}-v${last}: bump its version`)
  else if (last === version) ok(`${prefix} ${version}: unchanged, nothing to release`)
  else {
    ok(`${prefix} ${version} (last ${last ?? 'none'})`)
    toTag.push(`${prefix}-v${version}`)
  }
}

const market = readJson(join(ROOT, '.claude-plugin', 'marketplace.json'))
for (const mod of mods) {
  const version = readFileSync(join(ROOT, 'plugins', mod, 'src', 'plugin.tsx'), 'utf8').match(/version:\s*'([^']+)'/)?.[1]
  if (!version) {
    fail(`${mod}: no version in src/plugin.tsx`)
    continue
  }
  checkVersion(mod, version, [`plugins/${mod}`])
  const listed = market.plugins.find(p => p.name === mod)?.version
  if (listed !== version) fail(`${mod}: marketplace.json lists ${listed ?? 'nothing'}, the plugin is ${version}: run pnpm marketplace`)
}

const framework = readJson(join(ROOT, 'packages', 'bifrost', 'package.json')).version
checkVersion('framework', framework, ['packages/bifrost'])
const changelog = readFileSync(join(ROOT, 'packages', 'bifrost', 'CHANGELOG.md'), 'utf8')
if (!changelog.includes(`\n## ${framework}\n`)) fail(`CHANGELOG.md has no "## ${framework}" section: move Unreleased there`)

// --- workflows ---
if (capture('actionlint', ['-version'])) {
  if (run('actionlint', [], { cwd: ROOT }) === 0) ok('actionlint')
  else fail('actionlint: a workflow GitHub would reject')
} else {
  console.log(`${c.yellow('!')} actionlint is not installed: push main first and check \`gh run list\` before the tags`)
}

console.log('')
if (problems.length > 0) {
  console.log(c.red(`${problems.length} problem(s): fix them before tagging.`))
  process.exit(1)
}
console.log(toTag.length > 0 ? `Ready. Tags to push: ${c.bold(toTag.join(' '))}` : 'Ready. Nothing to release.')
