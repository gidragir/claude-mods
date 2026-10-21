// pnpm dev:link [-- <mod> ...]          mise.local.toml: `claude` started from a terminal in this repo
// pnpm dev:link:desktop [-- <mod> ...]  ~/.claude/settings.json env: every new Claude Desktop session
// pnpm dev:unlink | dev:unlink:desktop  remove this repo's mods
// pnpm dev:status                       show both
//
// Both set:
//   CLAUDE_CODE_PLUGIN_DIRS       each mod folder, loaded exactly as `--plugin-dir`
//   CLAUDE_CODE_PLUGIN_DIR_WATCH  =1 (only if unset) so long-lived headless sessions (Desktop, SDK) hot-reload on save
// settings.json: one dated backup per day (settings.json.<date>.bak), atomic write, refuses a non-JSON file.
// Claude Desktop does not inherit the shell's mise env, hence the separate --desktop target.
// Additive only: installed plugins (enabledPlugins), marketplaces and entries that point outside
// this repo are never touched. A mod whose name an installed, enabled plugin already uses is
// skipped (it would load twice); --force links it anyway.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import {
  c,
  externalPlugins,
  IS_WIN,
  isInside,
  listMods,
  modDir,
  nameClashes,
  PLUGINS,
  parseArgs,
  parseJson,
  printClashes,
  ROOT,
  writeFileAtomic,
  writeJson,
} from './lib.mjs'

const SETTINGS = join(homedir(), '.claude', 'settings.json')
const MISE_LOCAL = join(ROOT, 'mise.local.toml')
const DIRS = 'CLAUDE_CODE_PLUGIN_DIRS'
const WATCH = 'CLAUDE_CODE_PLUGIN_DIR_WATCH'
const { flags, rest } = parseArgs()

const norm = p => resolve(p).toLowerCase()
const inRepo = p => isInside(p, PLUGINS)
const split = v => (v ?? '').split(delimiter).filter(Boolean)

// ── targets: read() → env object, write(env) ──────────────────────────────
// settings.json is parsed strictly (a BOM is tolerated). Comments or trailing commas would be lost on
// rewrite, so a file that does not parse is never touched.
const readSettings = () => {
  if (!existsSync(SETTINGS)) return {}
  try {
    return parseJson(readFileSync(SETTINGS, 'utf8'))
  } catch (e) {
    throw new Error(`${SETTINGS} is not plain JSON (${e.message}): fix it by hand, nothing was written`)
  }
}
const desktop = {
  label: '~/.claude/settings.json (Claude Desktop)',
  read: () => readSettings().env ?? {},
  write(env) {
    const s = readSettings()
    // one backup per day: a second (possibly bad) run the same day cannot destroy the good copy
    if (existsSync(SETTINGS)) {
      const bak = `${SETTINGS}.${new Date().toISOString().slice(0, 10)}.bak`
      if (!existsSync(bak)) copyFileSync(SETTINGS, bak)
    }
    if (Object.keys(env).length > 0) s.env = env
    else delete s.env
    writeJson(SETTINGS, s)
  },
}

// Line-level edit of the [env] table: other keys and tables in the file are left as they are.
const KEY = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/
const mise = {
  label: 'mise.local.toml (terminal sessions)',
  read() {
    if (!existsSync(MISE_LOCAL)) return {}
    const env = {}
    let inEnv = false
    for (const l of readFileSync(MISE_LOCAL, 'utf8').split(/\r?\n/)) {
      if (/^\s*\[/.test(l)) inEnv = /^\s*\[env\]\s*$/.test(l)
      else if (inEnv) {
        const m = KEY.exec(l)
        if (m) env[m[1]] = m[2] ?? m[3].replace(/\\\\/g, '\\')
      }
    }
    return env
  },
  write(env) {
    const lines = existsSync(MISE_LOCAL) ? readFileSync(MISE_LOCAL, 'utf8').replace(/\n$/, '').split(/\r?\n/) : []
    const ours = [DIRS, WATCH].filter(k => env[k] !== undefined).map(k => `${k} = '${env[k]}'`)
    const start = lines.findIndex(l => /^\s*\[env\]\s*$/.test(l))
    if (start === -1) {
      if (ours.length > 0) lines.push(...(lines.length ? [''] : []), '[env]', ...ours)
    } else {
      let end = start + 1
      while (end < lines.length && !/^\s*\[/.test(lines[end])) end++
      const kept = lines.slice(start + 1, end).filter(l => ![DIRS, WATCH].includes(KEY.exec(l)?.[1]))
      lines.splice(start + 1, end - start - 1, ...ours, ...kept)
    }
    writeFileAtomic(MISE_LOCAL, `${lines.join('\n')}\n`)
  },
}

function show(t) {
  const env = t.read()
  console.log(c.bold(t.label))
  const dirs = split(env[DIRS])
  for (const p of dirs) console.log(`  ${inRepo(p) ? c.green('●') : c.dim('○')} ${p}${existsSync(p) ? '' : c.red('  (missing)')}`)
  if (dirs.length === 0) console.log(c.dim('  (no plugin dirs)'))
  console.log(`  ${WATCH} = ${env[WATCH] ?? c.dim('(unset)')}`)
  const unlinked = listMods().filter(m => dirs.length > 0 && !dirs.some(p => norm(p) === norm(modDir(m))))
  if (unlinked.length > 0) console.log(c.yellow(`  not linked: ${unlinked.join(', ')}`))
}

const GEMINI_CONFIG = join(homedir(), '.gemini', 'config')
const GEMINI_PLUGINS = join(GEMINI_CONFIG, 'plugins')
const GEMINI_SIDECARS = join(GEMINI_CONFIG, 'sidecars')

function geminiTarget(p) {
  try {
    return readlinkSync(p)
  } catch {
    return null
  }
}

function showGemini() {
  console.log(c.bold('~/.gemini/config (Google Antigravity)'))
  if (!existsSync(GEMINI_CONFIG)) {
    console.log(c.dim('  (config dir does not exist)'))
    return
  }
  const allMods = listMods()
  console.log(c.cyan('  Plugins:'))
  for (const mod of allMods) {
    const linkPath = join(GEMINI_PLUGINS, mod)
    const target = geminiTarget(linkPath)
    if (target && isInside(target, PLUGINS)) {
      console.log(`    ${c.green('●')} ${mod} → ${target}`)
    } else {
      console.log(`    ${c.dim('○')} ${mod} (not linked)`)
    }
  }
  console.log(c.cyan('  Sidecars:'))
  for (const mod of allMods) {
    const sidecarDir = join(modDir(mod), 'sidecars', mod)
    if (!existsSync(sidecarDir)) continue
    const linkPath = join(GEMINI_SIDECARS, mod)
    const target = geminiTarget(linkPath)
    if (target && isInside(target, PLUGINS)) {
      console.log(`    ${c.green('●')} ${mod} → ${target}`)
    } else {
      console.log(`    ${c.dim('○')} ${mod} (not linked)`)
    }
  }
}

if (flags.gemini || flags.antigravity) {
  const mods = listMods(rest)
  const isJunction = IS_WIN ? 'junction' : 'dir'
  if (flags.off) {
    for (const mod of mods) {
      const pLink = join(GEMINI_PLUGINS, mod)
      if (existsSync(pLink) && isInside(geminiTarget(pLink) || '', PLUGINS)) {
        rmSync(pLink, { recursive: true, force: true })
        console.log(c.green(`✔ unlinked plugin ${mod}`))
      }
      const sLink = join(GEMINI_SIDECARS, mod)
      if (existsSync(sLink) && isInside(geminiTarget(sLink) || '', PLUGINS)) {
        rmSync(sLink, { recursive: true, force: true })
        console.log(c.green(`✔ unlinked sidecar ${mod}`))
      }
    }
  } else {
    mkdirSync(GEMINI_PLUGINS, { recursive: true })
    mkdirSync(GEMINI_SIDECARS, { recursive: true })
    for (const mod of mods) {
      const pTarget = modDir(mod)
      const pLink = join(GEMINI_PLUGINS, mod)
      if (!existsSync(pLink)) {
        symlinkSync(pTarget, pLink, isJunction)
        console.log(c.green(`✔ linked plugin ${mod} → ${pLink}`))
      } else {
        console.log(c.dim(`plugin ${mod} already linked`))
      }

      const sTarget = join(pTarget, 'sidecars', mod)
      if (existsSync(sTarget)) {
        const sLink = join(GEMINI_SIDECARS, mod)
        if (!existsSync(sLink)) {
          symlinkSync(sTarget, sLink, isJunction)
          console.log(c.green(`✔ linked sidecar ${mod} → ${sLink}`))
        } else {
          console.log(c.dim(`sidecar ${mod} already linked`))
        }
      }
    }
  }
  showGemini()
  process.exit(0)
}

if (flags.status) {
  const external = externalPlugins()
  console.log(c.bold('Loaded besides this repo (untouched)'))
  for (const p of external.filter(p => p.enabled))
    console.log(`  ${c.dim('○')} ${p.source.includes('@') ? p.source : `${p.name} (${p.source})`}`)
  show(mise)
  show(desktop)
  showGemini()
  const clashes = nameClashes(listMods(), external)
  if (clashes.length > 0) {
    console.log(c.bold('Name clashes'))
    printClashes(clashes)
  }
  process.exit(0)
}

const target = flags.desktop ? desktop : mise
const env = { ...target.read() }
const foreign = split(env[DIRS]).filter(p => !inRepo(p))
let mods = flags.off ? [] : listMods(rest)
const clashes = nameClashes(mods)
printClashes(clashes)
const blocked = flags.force ? [] : clashes.filter(p => p.level === 'error').map(p => p.name)
if (blocked.length > 0) {
  console.log(c.red(`skipped: ${blocked.join(', ')} — rename the mod or disable the installed plugin (--force links anyway)`))
  mods = mods.filter(m => !blocked.includes(m))
}
const next = [...foreign, ...mods.map(modDir)]
const before = JSON.stringify(env)
if (next.length > 0) env[DIRS] = next.join(delimiter)
else delete env[DIRS]
// WATCH is ours only when it is '1': a value the user set on purpose is neither overwritten nor removed.
if (flags.off) {
  if (foreign.length === 0 && env[WATCH] === '1') delete env[WATCH]
} else env[WATCH] ??= '1'

if (JSON.stringify(env) === before) console.log(c.dim(`${target.label}: already up to date`))
else {
  target.write(env)
  console.log(c.green(`✔ ${target.label} updated`))
}
show(target)
console.log(
  c.yellow(
    flags.desktop
      ? 'Start a new session in Claude Desktop to pick it up; after that, saves hot-reload.'
      : 'Restart `claude` in this repo (mise activate) to pick it up. For Claude Desktop: pnpm dev:link:desktop',
  ),
)
