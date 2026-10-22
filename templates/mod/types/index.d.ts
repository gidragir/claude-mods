export type ModItem = { id: string; title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    __MOD_NAME__: {
      items: ModItem[]
      selected: string | null
    }
  }
}
