// pnpm types:sync [-- --from=<dir-or-file>]
// Vendors the engine's API declarations into types/engine/, picking the newest
// Claude Code version found among:
//   1. plugins/*/.claude-plugin/types/            (laid by the engine on load/reload: API + tools + MCP)
//   2. ~/.claude/dev-mods/*/*/.claude-plugin/types/
//   3. <tmp>/claude/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts  (written when the skill loads)
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { c, claudeVersion, cmpVer, ENGINE_TYPES, PLUGINS, parseArgs, typesVersion } from './lib.mjs'

const PARTS = ['claude-code', 'claude-code-tools', 'claude-code-mcp']
const subdirs = d =>
  existsSync(d)
    ? readdirSync(d)
        .map(n => join(d, n))
        .filter(p => statSync(p).isDirectory())
    : []

/** A candidate is either a laid folder (multi-part) or the single combined file. */
function candidates() {
  const out = []
  const laid = dir => {
    const api = join(dir, 'claude-code', 'index.d.ts')
    const v = typesVersion(api)
    if (v) out.push({ kind: 'laid', dir, version: v, mtime: statSync(api).mtimeMs })
  }
  for (const p of subdirs(PLUGINS)) laid(join(p, '.claude-plugin', 'types'))
  for (const s of subdirs(join(homedir(), '.claude', 'dev-mods'))) for (const m of subdirs(s)) laid(join(m, '.claude-plugin', 'types'))
  for (const ver of subdirs(join(tmpdir(), 'claude', 'bundled-skills')))
    for (const h of subdirs(ver)) {
      const f = join(h, 'plugin-authoring', 'types', 'claude-code.d.ts')
      const v = typesVersion(f)
      if (v) out.push({ kind: 'single', file: f, version: v, mtime: statSync(f).mtimeMs })
    }
  // newest version first; within a version prefer laid (it carries tools + MCP), then freshest
  return out.sort(
    (a, b) => cmpVer(b.version, a.version) || (a.kind === 'laid' ? -1 : 1) - (b.kind === 'laid' ? -1 : 1) || b.mtime - a.mtime,
  )
}

const { flags } = parseArgs()
let pick
if (typeof flags.from === 'string') {
  const f = flags.from
  pick = f.endsWith('.d.ts')
    ? { kind: 'single', file: f, version: typesVersion(f) }
    : { kind: 'laid', dir: f, version: typesVersion(join(f, 'claude-code', 'index.d.ts')) }
  if (!pick.version) throw new Error(`no engine declarations at ${f}`)
} else {
  pick = candidates()[0]
}

if (!pick) {
  console.log(c.red('No engine types found.'))
  console.log('Load a mod once in a session (or invoke the /plugin-authoring skill) so the engine writes them, then rerun.')
  process.exit(1)
}

// Build the new set next to the old one and swap, so a failed copy never leaves types/engine empty.
const STAGING = `${ENGINE_TYPES}.new`
const OLD = `${ENGINE_TYPES}.old`
rmSync(STAGING, { recursive: true, force: true })
const copied = []
if (pick.kind === 'laid') {
  for (const part of PARTS) {
    const src = join(pick.dir, part, 'index.d.ts')
    if (!existsSync(src)) continue
    mkdirSync(join(STAGING, part), { recursive: true })
    copyFileSync(src, join(STAGING, part, 'index.d.ts'))
    copied.push(part)
  }
} else {
  mkdirSync(join(STAGING, 'claude-code'), { recursive: true })
  copyFileSync(pick.file, join(STAGING, 'claude-code', 'index.d.ts'))
  copied.push('claude-code')
}
if (!copied.includes('claude-code')) {
  rmSync(STAGING, { recursive: true, force: true })
  throw new Error(`${pick.dir ?? pick.file} has no claude-code/index.d.ts: types/engine left as it was`)
}
const dropped = PARTS.filter(part => !copied.includes(part) && existsSync(join(ENGINE_TYPES, part)))
rmSync(OLD, { recursive: true, force: true })
if (existsSync(ENGINE_TYPES)) renameSync(ENGINE_TYPES, OLD)
renameSync(STAGING, ENGINE_TYPES)
rmSync(OLD, { recursive: true, force: true })
if (dropped.length > 0)
  console.log(
    c.yellow(`! source has no ${dropped.join(', ')}: those parts are gone from types/engine (the single-file source carries API only)`),
  )

console.log(c.green(`✔ types/engine ← Claude Code ${pick.version}`), c.dim(pick.dir ?? pick.file))
const cli = claudeVersion()
if (cli && cli !== pick.version)
  console.log(c.yellow(`! CLI is ${cli}; types will catch up after a mod reloads under it (rerun types:sync).`))
