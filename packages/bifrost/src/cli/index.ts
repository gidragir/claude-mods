#!/usr/bin/env node
/**
 * Bifrost CLI Compiler & Asset Synchronizer.
 * Builds production standalone bundles for Claude Code, Antigravity Sidecars,
 * and Webviews via esbuild, and syncs runtime assets for zero-build local development.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import type { ModConfig } from '../core/mod'

export async function loadModConfig(modDir: string) {
  const tsConfig = join(modDir, 'mod.config.ts')
  const jsConfig = join(modDir, 'mod.config.js')
  const configPath = existsSync(tsConfig) ? tsConfig : existsSync(jsConfig) ? jsConfig : null

  if (!configPath) return null

  try {
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch (_e) {
    // If native import fails, transpile in-memory via esbuild
    const code = readFileSync(configPath, 'utf8')
    const result = await esbuild.transform(code, { loader: 'ts', format: 'esm' })
    const dataUri = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`
    const mod = await import(dataUri)
    return mod.default || mod
  }
}

import { checkIsMain } from '../server/sidecar'

function writeJsonIfChanged(filePath: string, obj: unknown) {
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf8'))
      if (JSON.stringify(existing) === JSON.stringify(obj)) {
        return
      }
    } catch {}
  }
  let str = `${JSON.stringify(obj, null, 2)}\n`
  str = str.replace(/\[\s+(".*?")\s+\]/g, '[$1]')
  writeFileSync(filePath, str)
}

export async function generateManifests(modDir: string, config: ModConfig & Record<string, unknown>) {
  if (!config?.name) return

  const modName = config.name

  // 1. .claude-plugin/plugin.json
  const claudePluginDir = join(modDir, '.claude-plugin')
  mkdirSync(claudePluginDir, { recursive: true })
  const claudePluginPath = join(claudePluginDir, 'plugin.json')
  let existingClaude: Record<string, unknown> = {}
  if (existsSync(claudePluginPath)) {
    try {
      existingClaude = JSON.parse(readFileSync(claudePluginPath, 'utf8'))
    } catch {}
  }

  const userConfig: Record<string, unknown> = { ...((existingClaude.userConfig as Record<string, unknown>) || {}) }
  if (config.configSchema) {
    for (const [key, prop] of Object.entries(config.configSchema)) {
      const p = prop as Record<string, unknown>
      userConfig[key] = {
        type: p.type || 'string',
        title: p.title || key,
        description: p.description || '',
        default: p.default !== undefined ? p.default : '',
      }
    }
  }

  const claudePluginJson: Record<string, unknown> = {
    name: config.name,
    version: config.version || existingClaude.version || '0.1.0',
    description: config.description || existingClaude.description || '',
  }
  const types = config.types || existingClaude.types
  if (types) claudePluginJson.types = types

  const author =
    typeof config.author === 'object' && config.author
      ? config.author
      : config.author
        ? { name: config.author }
        : existingClaude.author || { name: 'gidragir' }
  claudePluginJson.author = author

  const license = config.license || existingClaude.license
  if (license) claudePluginJson.license = license

  const repo = config.repository || existingClaude.repository
  if (repo) claudePluginJson.repository = repo

  if (Object.keys(userConfig).length > 0) {
    claudePluginJson.userConfig = userConfig
  }

  writeJsonIfChanged(claudePluginPath, claudePluginJson)

  // 2. hooks/hooks.json
  const hooksDir = join(modDir, 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  writeJsonIfChanged(join(hooksDir, 'hooks.json'), { modules: ['./register.tsx'] })

  // 3. plugin.json (Antigravity root)
  const agyPluginPath = join(modDir, 'plugin.json')
  let existingAgy: Record<string, unknown> = {}
  if (existsSync(agyPluginPath)) {
    try {
      existingAgy = JSON.parse(readFileSync(agyPluginPath, 'utf8'))
    } catch {}
  }
  const agyPluginJson = {
    name: config.name,
    displayName: config.displayName || (existingAgy.displayName as string) || config.name,
    description: config.description || (existingAgy.description as string) || '',
    version: config.version || (existingAgy.version as string) || '0.1.0',
    suggestedPrompts:
      config.suggestedPrompts && config.suggestedPrompts.length > 0
        ? config.suggestedPrompts
        : (existingAgy.suggestedPrompts as unknown[]) || [],
  }
  writeJsonIfChanged(agyPluginPath, agyPluginJson)

  // 4. sidecars/<name>/sidecar.json
  if (config.sidecar?.enabled) {
    const sidecarDir = join(modDir, 'sidecars', modName)
    mkdirSync(sidecarDir, { recursive: true })
    const sidecarPath = join(sidecarDir, 'sidecar.json')
    let existingSidecar: Record<string, unknown> = {}
    if (existsSync(sidecarPath)) {
      try {
        existingSidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'))
      } catch {}
    }
    const existingUiConfig = existingSidecar.ui_config as { views?: unknown[] } | undefined
    const sidecarJson = {
      command: config.sidecar.command || (existingSidecar.command as string) || 'node',
      args: config.sidecar.args || (existingSidecar.args as string[]) || ['server.mjs'],
      restart_policy: 'always',
      display_name: config.displayName || (existingSidecar.display_name as string) || config.name,
      description: config.description || (existingSidecar.description as string) || '',
      has_web_ui: true,
      ui_config: {
        views: config.sidecar.views ||
          existingUiConfig?.views || [
            {
              entrypoint: config.sidecar.entrypoint || 'SIDECAR_UI_ENTRYPOINT_AUX_PANE',
              path: '/',
              title: config.sidecar.title || config.displayName || 'UI',
            },
          ],
      },
    }
    writeJsonIfChanged(sidecarPath, sidecarJson)
  }
}

export async function buildPlugin(modDir: string) {
  const absDir = resolve(modDir)
  const config = await loadModConfig(absDir)
  const modName = config?.name || basename(absDir)

  console.log(`Building Bifrost plugin [${modName}] at ${absDir}...`)

  // Generate manifests if mod.config exists
  if (config) {
    await generateManifests(absDir, config)
    console.log('  ✔ Manifests generated')
  }

  const outDir = join(absDir, 'dist')
  mkdirSync(outDir, { recursive: true })

  // 1. Claude Code target
  const registerPath = join(absDir, 'hooks', 'register.tsx')
  if (existsSync(registerPath)) {
    try {
      await esbuild.build({
        entryPoints: [registerPath],
        outfile: join(outDir, 'claude.js'),
        bundle: true,
        format: 'esm',
        target: 'es2023',
        jsx: 'transform',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        external: ['claude-code', 'claude-code/*'],
        sourcemap: true,
      })
      console.log('  ✔ Claude Code target bundled -> dist/claude.js')
    } catch (e: unknown) {
      console.warn('  ! Claude Code bundle warning:', e instanceof Error ? e.message : String(e))
    }
  }

  // 2. Sidecar target
  const serverPath = join(absDir, 'sidecars', modName, 'server.mjs')
  if (existsSync(serverPath)) {
    try {
      await esbuild.build({
        entryPoints: [serverPath],
        outfile: join(outDir, 'sidecar.mjs'),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        external: ['node:*'],
        sourcemap: true,
      })
      console.log('  ✔ Sidecar target bundled -> dist/sidecar.mjs')
    } catch (e: unknown) {
      console.warn('  ! Sidecar bundle warning:', e instanceof Error ? e.message : String(e))
    }
  }

  // 3. Webview UI target
  const uiPath = join(absDir, 'sidecars', modName, 'ui', 'index.html')
  if (existsSync(uiPath)) {
    copyFileSync(uiPath, join(outDir, 'index.html'))
    console.log('  ✔ Webview UI copied -> dist/index.html')
  }

  console.log(`✔ Finished build for [${modName}]`)
}

export async function runCli(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'build'
  const targetDir = argv[1] || '.'

  if (cmd === 'build') {
    await buildPlugin(targetDir)
  } else if (cmd === 'manifests') {
    const config = await loadModConfig(resolve(targetDir))
    if (!config) {
      console.error('No mod.config.ts found in', targetDir)
      process.exit(1)
    }
    await generateManifests(resolve(targetDir), config)
    console.log('✔ Manifests generated')
  } else {
    console.log('Usage: bifrost [build|manifests] [mod-dir]')
  }
}

// Check if run directly as main CLI script
if (checkIsMain(import.meta.url, process.argv[1])) {
  runCli().catch(err => {
    console.error('Bifrost CLI error:', err)
    process.exit(1)
  })
}
