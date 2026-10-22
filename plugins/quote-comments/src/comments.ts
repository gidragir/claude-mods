// Pure logic: the comment block appended to a message. No host, easy to unit-test.

// quote is empty while the pane waits for it to be pasted (a surface that shares no selection)
export type Draft = { quote: string; ref?: string; note?: string }
export type Comment = { id: number; quote: string; ref?: string; note: string }
export type Editing = { id: number; note: string } | null

export const MAX_QUOTE = 2000 // characters of a quote carried into the message

// One line of the quote for the pane: whitespace folded, cut to `max` with an ellipsis.
export function preview(quote: string, max = 60): string {
  const line = quote.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function quoteLines(quote: string): string {
  const text = quote.trim()
  const cut = text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE)}…` : text
  return cut
    .split('\n')
    .map(l => `> ${l}`.trimEnd())
    .join('\n')
}

// The block appended to the message: each quote as a Markdown blockquote, the comment under it.
export function formatBlock(comments: readonly Comment[]): string {
  const parts = comments.map((c, i) => `**[${i + 1}]**\n${quoteLines(c.quote)}\n\n${c.note.trim()}`)
  return `Comments on fragments of the conversation:\n\n${parts.join('\n\n')}`
}

// The user's own text first, then the comments; an empty text leaves the block alone.
export function appendComments(text: string, comments: readonly Comment[]): string {
  if (comments.length === 0) return text
  const own = text.trimEnd()
  const block = formatBlock(comments)
  return own === '' ? block : `${own}\n\n${block}`
}

export function countLabel(n: number): string {
  return n === 1 ? '1 comment' : `${n} comments`
}
