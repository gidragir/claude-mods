// pnpm new <mod-name> ["one-line description"]
// Scaffolds plugins/<mod-name>/ from templates/mod and refreshes the marketplace.
// Linking (dev:link*) stays a separate, explicit step.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { c, modDir, nameClashes, parseArgs, printClashes, ROOT, renderTemplate, run } from './lib.mjs'

const { rest } = parseArgs()
const [name, description = 'TODO: one-line description'] = rest
if (!name || !/^[a-z][a-z0-9-]{1,40}$/.test(name)) {
  console.log(c.red('usage: pnpm new <mod-name> ["description"]   (kebab-case, a-z0-9-)'))
  process.exit(1)
}
const dir = modDir(name)
if (existsSync(dir)) {
  console.log(c.red(`plugins/${name} already exists`))
  process.exit(1)
}

const clashes = nameClashes([name])
printClashes(clashes)
if (clashes.some(p => p.kind === 'installed')) {
  console.log(c.red(`"${name}" is taken by an installed plugin: pick another name`))
  process.exit(1)
}

cpSync(join(ROOT, 'templates', 'mod'), dir, { recursive: true })

const fill = d => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) fill(p)
    else writeFileSync(p, renderTemplate(p, readFileSync(p, 'utf8'), name, description))
  }
}
fill(dir)
console.log(c.green(`✔ plugins/${name} created`))

run(process.execPath, [join(ROOT, 'scripts', 'marketplace.mjs')])
run('pnpm', ['install', '--silent'], { cwd: ROOT })

// Never re-link automatically: dev-link would override a deliberate subset and
// ~/.claude/settings.json is global (AGENTS.md: only with the user's explicit consent). Just hint.
const plugins = join(ROOT, 'plugins')
const links = [
  { file: join(ROOT, 'mise.local.toml'), needle: plugins, cmd: 'pnpm dev:link' },
  { file: join(homedir(), '.claude', 'settings.json'), needle: plugins.replaceAll('\\', '\\\\'), cmd: 'pnpm dev:link:desktop' },
  { file: join(homedir(), '.gemini', 'config', 'plugins'), needle: '', cmd: 'pnpm dev:link:gemini' },
]
for (const l of links)
  if (existsSync(l.file) && (!l.needle || readFileSync(l.file, 'utf8').includes(l.needle)))
    console.log(c.yellow(`Local dev environment detected in ${l.file}: to link "${name}", run ${c.cyan(l.cmd)}`))

console.log(`
Next steps:
  Claude Code:
    ${c.cyan(`plugins/${name}/hooks/register.tsx`)}   implement function hooks
    ${c.cyan(`pnpm check ${name}`)}                  validate + typecheck + test
    ${c.cyan('pnpm dev:link:desktop')}                load in Claude Desktop with hot reload

  Google Antigravity:
    ${c.cyan(`plugins/${name}/sidecars/${name}/`)}    add sidecar.json, server.mjs, and webview UI
    ${c.cyan('pnpm test:sidecar')}                    run sidecar test suite
    ${c.cyan('pnpm dev:link:gemini')}                 link into ~/.gemini/config for Auxiliary Pane`)
