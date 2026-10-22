import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMarkdown } from '../server/markdown.mjs'

test('renderMarkdown: basic formatting', () => {
  const md = '# Title\n**bold** and *italic* and `code`'
  const html = renderMarkdown(md)
  assert.ok(html.includes('<h2>Title</h2>'), 'Heading offset applied')
  assert.ok(html.includes('<strong>bold</strong>'))
  assert.ok(html.includes('<em>italic</em>'))
  assert.ok(html.includes('<code>code</code>'))
})

test('renderMarkdown: artifact badge highlighting', () => {
  const md = 'See RV-1 and FB-42 for details.'
  const html = renderMarkdown(md)
  assert.ok(html.includes('<mark class="badge accent">RV-1</mark>'))
  assert.ok(html.includes('<mark class="badge accent">FB-42</mark>'))
})

test('renderMarkdown: lists and tables', () => {
  const md = `- Item 1\n- Item 2\n\n| H1 | H2 |\n|---|---|\n| D1 | D2 |`
  const html = renderMarkdown(md)
  assert.ok(html.includes('<ul>'))
  assert.ok(html.includes('<li>Item 1</li>'))
  assert.ok(html.includes('<th>H1</th>'))
  assert.ok(html.includes('<td>D1</td>'))
})
