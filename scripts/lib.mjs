// Shared helpers for repo scripts. Plain Node, no deps, cross-platform.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const PLUGINS = join(ROOT, 'plugins')
export const ENGINE_TYPES = join(ROOT, 'types', 'engine')
export const IS_WIN = process.platform === 'win32'

const tty = process.stdout.isTTY
const paint = code => s => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
export const c = { red: paint(31), green: paint(32), yellow: paint(33), dim: paint(2), bold: paint(1), cyan: paint(36) }

/** Parses JSON text; tolerates a UTF-8 BOM (Windows editors add one). */
export const parseJson = text => JSON.parse(text.replace(/^﻿/, ''))
export const readJson = p => parseJson(readFileSync(p, 'utf8'))

/** Writes via a temp file + rename, so a crash never leaves a half-written file. */
export function writeFileAtomic(p, data) {
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, p)
}
export const writeJson = (p, v) => writeFileAtomic(p, `${JSON.stringify(v, null, 2)}\n`)

/** True when `p` is `dir` itself or inside it (a sibling like `plugins-old` does not count). */
export const isInside = (p, dir) => {
  const a = norm(p)
  const b = norm(dir)
  return a === b || a.startsWith(b + sep)
}

// ── mod template ─────────────────────────────────────────────────────────
// The description lands inside JSON strings, single-quoted TS strings and markdown: escape per file type.
const jsonEsc = s => JSON.stringify(s).slice(1, -1)
const escFor = file => {
  if (file.endsWith('.json')) return jsonEsc
  if (/\.(ts|tsx)$/.test(file)) return s => jsonEsc(s).replaceAll("'", "\\'").replaceAll('\\"', '"')
  return s => s
}

/** Fills the `__MOD_NAME__` / `__MOD_DESCRIPTION__` placeholders of one template file. */
export function renderTemplate(file, text, name, description) {
  const desc = escFor(file)(description)
  // replacer functions: `$&`, `$'` etc. in the description are not special patterns
  return text.replaceAll('__MOD_NAME__', () => name).replaceAll('__MOD_DESCRIPTION__', () => desc)
}

/** Mod folders under plugins/ (those with a manifest), optionally filtered by name. */
export function listMods(names = []) {
  const all = existsSync(PLUGINS)
    ? readdirSync(PLUGINS, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(join(PLUGINS, d.name, '.claude-plugin', 'plugin.json')))
        .map(d => d.name)
        .sort()
    : []
  if (names.length === 0) return all
  const unknown = names.filter(n => !all.includes(n))
  if (unknown.length > 0) throw new Error(`unknown mod(s): ${unknown.join(', ')}. Known: ${all.join(', ') || '(none)'}`)
  return names
}

export const modDir = name => join(PLUGINS, name)
export const manifestOf = name => readJson(join(modDir(name), '.claude-plugin', 'plugin.json'))

// On Windows `claude`/`pnpm` are .cmd shims and need a shell; the shell gets one quoted
// command line (passing an args array with shell:true is deprecated, DEP0190).
// cmd.exe has no reliable way to escape `"` inside quotes, so such arguments are refused outright.
const quote = a => {
  if (/^[\w.:\\/=,@+-]+$/.test(a)) return a
  if (a.includes('"')) throw new Error(`argument with a double quote cannot be passed through cmd.exe: ${a}`)
  return `"${a}"`
}
const spawn = (cmd, args, opts) =>
  IS_WIN && cmd !== process.execPath ? spawnSync([cmd, ...args].map(quote).join(' '), { shell: true, ...opts }) : spawnSync(cmd, args, opts)

/** Runs a command, streaming output; returns the exit code. */
export function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: 'inherit', ...opts }).status ?? 1
}

/** Captures stdout of a command; undefined when it fails. */
export function capture(cmd, args) {
  const r = spawn(cmd, args, { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : undefined
}

export const claudeVersion = () => capture('claude', ['--version'])?.match(/\d+\.\d+\.\d+/)?.[0]

/** "Written by Claude Code 2.1.295." on the first line of the engine's d.ts. */
export function typesVersion(file) {
  if (!existsSync(file)) return undefined
  return readFileSync(file, 'utf8')
    .slice(0, 200)
    .match(/Claude Code (\d+\.\d+\.\d+)/)?.[1]
}

export const cmpVer = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** `--key=value` / `--flag` / positional. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}
  const rest = []
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
    if (m) flags[m[1]] = m[2] ?? true
    else rest.push(a)
  }
  return { flags, rest }
}

/**
 * Plugins that load besides this repo's: installed ones (`claude plugin list`), skills-dir plugins
 * (~/.claude/skills/<name>) and session mods folders (~/.claude/dev-mods/<session>/<name>).
 * This repo only adds plugin dirs; it never disables or edits those. A name taken twice loads twice.
 */
export function externalPlugins() {
  const out = []
  let installed = []
  const listed = capture('claude', ['plugin', 'list', '--json'])
  if (listed) {
    try {
      installed = JSON.parse(listed)
    } catch {
      console.log(c.yellow('! `claude plugin list --json` printed non-JSON: installed plugins are not checked for name clashes'))
    }
  }
  for (const p of installed) {
    out.push({
      name: p.id.split('@')[0],
      source: p.id,
      kind: 'installed',
      enabled: p.enabled && (p.scope === 'user' || norm(p.projectPath) === norm(process.cwd())),
      path: p.installPath,
    })
  }
  const scan = (dir, source, kind) => {
    if (!existsSync(dir)) return
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const manifest = join(dir, d.name, '.claude-plugin', 'plugin.json')
      if (d.isDirectory() && existsSync(manifest))
        out.push({ name: readJson(manifest).name ?? d.name, source, kind, enabled: true, path: join(dir, d.name) })
    }
  }
  scan(join(homedir(), '.claude', 'skills'), 'skills-dir', 'installed')
  const devMods = join(homedir(), '.claude', 'dev-mods')
  if (existsSync(devMods)) for (const s of readdirSync(devMods)) scan(join(devMods, s), `dev-mods/${s.slice(0, 8)}`, 'session')
  // this repo's own mods show up as `<name>@inline` once linked
  return out.filter(p => !isInside(p.path, PLUGINS))
}

const norm = p => (p ? resolve(p).toLowerCase() : '')

/**
 * External plugins whose name a repo mod also uses. `error`: an installed or skills-dir plugin
 * (both would load in every session); `warn`: a session mods folder (loads only in the session
 * that enabled hot reload for it).
 */
export function nameClashes(mods, external = externalPlugins()) {
  return external.filter(p => mods.includes(p.name)).map(p => ({ ...p, level: p.kind === 'installed' && p.enabled ? 'error' : 'warn' }))
}

export function printClashes(clashes) {
  for (const p of clashes) {
    const msg = `${p.name}: also ${p.kind === 'installed' ? (p.enabled ? 'installed and enabled' : 'installed (disabled)') : 'in a session mods folder'} as ${p.source}`
    console.log(p.level === 'error' ? c.red(`✘ ${msg}`) : c.yellow(`! ${msg}`), c.dim(p.path))
  }
}
