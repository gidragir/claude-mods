export type RefItem = { id: string; file: string; line: number; text: string }

declare module 'claude-code' {
  interface PluginState {
    'ref-pane': { items: RefItem[]; selected: string | null; roots: string[]; status: string; searchQuery: string; configPrefixes: string }
  }
}
