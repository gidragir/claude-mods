import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import * as esbuild from 'esbuild'

const entries = [
  { in: 'src/index.ts', out: 'dist/index.js' },
  { in: 'src/core/index.ts', out: 'dist/core.js' },
  { in: 'src/server/index.ts', out: 'dist/server.js' },
  { in: 'src/ui/index.ts', out: 'dist/ui.js' },
  { in: 'src/cli/index.ts', out: 'dist/cli.js' },
]

mkdirSync('dist', { recursive: true })
mkdirSync('dist/ui/web', { recursive: true })

for (const e of entries) {
  await esbuild.build({
    entryPoints: [e.in],
    outfile: e.out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['claude-code', 'claude-code/*', 'node:*', 'esbuild'],
    banner: e.banner ? { js: e.banner } : undefined,
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    sourcemap: true,
  })
}

// Copy web assets
if (existsSync('src/ui/web/pico.antigravity.css')) {
  copyFileSync('src/ui/web/pico.antigravity.css', 'dist/ui/web/pico.antigravity.css')
}
if (existsSync('src/ui/web/client.ts')) {
  // Bundle client.ts to dist/ui/web/client.js for browsers
  await esbuild.build({
    entryPoints: ['src/ui/web/client.ts'],
    outfile: 'dist/ui/web/client.js',
    bundle: true,
    format: 'esm',
    target: 'es2022',
  })
}

// Emit TypeScript declaration files
try {
  execSync('node ../../node_modules/typescript/bin/tsc -p .', { stdio: 'inherit' })
  writeFileSync('dist/core.d.ts', "export * from './core/index'\n")
  writeFileSync('dist/server.d.ts', "export * from './server/index'\n")
  writeFileSync('dist/ui.d.ts', "export * from './ui/index'\n")
} catch (e) {
  console.warn('Warning: TypeScript declaration emit failed:', e)
}

console.log('✔ @gidragir/bifrost built successfully.')
