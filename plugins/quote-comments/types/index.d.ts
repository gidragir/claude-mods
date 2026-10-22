// quote is empty while the pane waits for it to be pasted (a surface that shares no selection)
export type Draft = { quote: string; ref?: string; note?: string }
export type Comment = { id: number; quote: string; ref?: string; note: string }
export type Editing = { id: number; note: string } | null

declare module 'claude-code' {
  interface PluginState {
    'quote-comments': { comments: Comment[]; draft: Draft | null; nextId: number; editing: Editing }
  }
}
