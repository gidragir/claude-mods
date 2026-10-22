import { defineMod } from '@gidragir/bifrost'

export default defineMod({
  name: 'quote-comments',
  displayName: 'Quote Comments',
  version: '0.2.0',
  description: 'Comment on text selected in the chat: collect quoted comments and append them to your next message',
  types: './types/index.d.ts',
  author: 'gidragir',
  license: 'MIT',
  repository: 'https://github.com/gidragir/claude-mods',
  commands: [{ name: 'comment', description: 'Gather comments on selected code or text: /comment note (no note: open the pane)' }],
})
