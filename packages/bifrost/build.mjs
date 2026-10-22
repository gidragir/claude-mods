// Builds the publishable package into dist/ (with its own package.json): `npm publish dist`.
// Inside the monorepo nothing needs it: package.json exports point at src and Bun/esbuild read TypeScript.
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as esbuild from 'esbuild'

const entries = {
  index: 'src/index.ts',
  'jsx-runtime': 'src/jsx-runtime.ts',
  'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
  claude: 'src/claude/index.ts',
  agy: 'src/agy/index.ts',
  testing: 'src/testing/index.ts',
  'cli-api': 'src/cli/index.ts',
  cli: 'src/cli/bin.ts',
}

rmSync('dist', { recursive: true, force: true })
await esbuild.build({
  entryPoints: entries,
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  jsxImportSource: '@gidragir/bifrost',
  // the generated per-plugin state module and the engine's module resolve when a plugin is built
  external: ['claude-code', 'claude-code/*', 'virtual:bifrost/*', 'esbuild'],
  logLevel: 'warning',
})
// the bin runs under Node once published
const cli = readFileSync('dist/cli.js', 'utf8').replace(/^#!.*\n/, '')
writeFileSync('dist/cli.js', `#!/usr/bin/env node\n${cli}`)

const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc')
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' })

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const exp = (name, types) => ({ types: `./types/${types}.d.ts`, default: `./${name}.js` })
writeFileSync(
  'dist/package.json',
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      type: 'module',
      license: pkg.license,
      bin: { bifrost: './cli.js' },
      exports: {
        '.': exp('index', 'index'),
        './jsx-runtime': exp('jsx-runtime', 'jsx-runtime'),
        './jsx-dev-runtime': exp('jsx-dev-runtime', 'jsx-dev-runtime'),
        './claude': exp('claude', 'claude/index'),
        './agy': exp('agy', 'agy/index'),
        './testing': exp('testing', 'testing/index'),
        './cli': exp('cli-api', 'cli/index'),
      },
      publishConfig: pkg.publishConfig,
      dependencies: pkg.dependencies,
    },
    null,
    2,
  )}\n`,
)
copyFileSync('README.md', 'dist/README.md')
console.log('✔ @gidragir/bifrost built into dist/')
