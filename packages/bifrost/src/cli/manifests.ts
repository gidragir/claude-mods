/**
 * Manifests of the built plugin, derived from `definePlugin`. Pure: returns objects, writes nothing.
 */

import type { Plugin } from '../core/plugin'

export interface Defaults {
  author?: Plugin['author']
  license?: string
  repository?: string
}

const AUX_PANE = 'SIDECAR_UI_ENTRYPOINT_AUX_PANE'

/** `.claude-plugin/plugin.json`. */
export function claudeManifest(plugin: Plugin, defaults: Defaults = {}): Record<string, unknown> {
  const author = plugin.author ?? defaults.author
  const out: Record<string, unknown> = {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    types: './types/state.d.ts',
  }
  if (author) out.author = typeof author === 'string' ? { name: author } : author
  const license = plugin.license ?? defaults.license
  if (license) out.license = license
  const repository = plugin.repository ?? defaults.repository
  if (repository) out.repository = repository
  const fields = Object.entries(plugin.config ?? {})
  if (fields.length > 0)
    out.userConfig = Object.fromEntries(
      fields.map(([key, f]) => [key, { type: f.type, title: f.title ?? key, description: f.description ?? '', default: f.default ?? '' }]),
    )
  return out
}

/** `hooks/hooks.json`. */
export const hooksManifest = (raw: boolean) => ({ modules: raw ? ['./index.js', './raw.js'] : ['./index.js'] })

/** Antigravity's root `plugin.json`. */
export const agyManifest = (plugin: Plugin) => ({
  name: plugin.name,
  displayName: plugin.displayName ?? plugin.name,
  description: plugin.description,
  version: plugin.version,
  suggestedPrompts: plugin.suggestedPrompts ?? [],
})

/** The URL path a pane is served at: the first at `/`, the others at `/pane/<id>`. */
export const panePath = (plugin: Plugin, id: string): string => (Object.keys(plugin.panes ?? {})[0] === id ? '/' : `/pane/${id}`)

/** `sidecars/<name>/sidecar.json` (Antigravity's file name): one aux-pane view per pane. */
export function sidecarManifest(plugin: Plugin): Record<string, unknown> {
  const panes = Object.entries(plugin.panes ?? {})
  return {
    command: 'node',
    args: ['server.mjs'],
    restart_policy: 'always',
    display_name: plugin.displayName ?? plugin.name,
    description: plugin.description,
    has_web_ui: panes.length > 0,
    ui_config: {
      views: panes.map(([id, pane]) => ({ entrypoint: AUX_PANE, path: panePath(plugin, id), title: pane.title ?? id })),
    },
  }
}
