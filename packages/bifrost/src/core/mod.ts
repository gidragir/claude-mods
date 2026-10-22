/**
 * Mod manifest and configuration schema definitions for Bifrost plugins.
 */

export interface SidecarViewConfig {
  entrypoint: string
  path: string
  title: string
}

export interface SidecarConfig {
  enabled: boolean
  title?: string
  entrypoint?: string
  command?: string
  args?: string[]
  port?: number
  views?: SidecarViewConfig[]
}

export interface CommandConfig {
  name: string
  description: string
  handler?: string
}

export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean'
  title?: string
  default?: string | number | boolean
  description?: string
}

export interface ModConfig {
  name: string
  displayName?: string
  version: string
  description: string
  author?: string | { name: string; email?: string; url?: string }
  license?: string
  repository?: string
  types?: string
  suggestedPrompts?: string[]
  sidecar?: SidecarConfig
  commands?: CommandConfig[]
  configSchema?: Record<string, ConfigProperty | { type: string; title?: string; default?: unknown; description?: string }>
  dependencies?: string[]
}

/**
 * Type-safe configuration helper for defining a Bifrost mod.
 */
export function defineMod(config: ModConfig): ModConfig {
  return config
}
