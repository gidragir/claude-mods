import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { renderMarkdown } from '../dist/ui.js'

test('renderMarkdown: basic formatting, headings, links', () => {
  const md = '# Header 1\n\n**bold** and *italic* and `code`\n\n[Link](https://example.com)'
  const html = renderMarkdown(md)

  assert.ok(html.includes('<h2>Header 1</h2>'))
  assert.ok(html.includes('<strong>bold</strong>'))
  assert.ok(html.includes('<em>italic</em>'))
  assert.ok(html.includes('<code>code</code>'))
  assert.ok(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>'))
})

test('renderMarkdown: artifact badge highlighting', () => {
  const md = 'Refer to RV-1, FB-2, T-3, ADR-4, and AC-5 for details.'
  const html = renderMarkdown(md)

  assert.ok(html.includes('<mark class="badge accent">RV-1</mark>'))
  assert.ok(html.includes('<mark class="badge accent">FB-2</mark>'))
  assert.ok(html.includes('<mark class="badge accent">T-3</mark>'))
  assert.ok(html.includes('<mark class="badge accent">ADR-4</mark>'))
  assert.ok(html.includes('<mark class="badge accent">AC-5</mark>'))
})

test('renderMarkdown: code blocks, tables, blockquotes', () => {
  const md = `
> Important note

| ID | Title |
| --- | --- |
| RV-1 | Fix bug |

\`\`\`javascript
const x = 1;
\`\`\`
`
  const html = renderMarkdown(md)

  assert.ok(html.includes('<blockquote>'))
  assert.ok(html.includes('<table>'))
  assert.ok(html.includes('<th>ID</th>'))
  assert.ok(html.includes('<mark class="badge accent">RV-1</mark>'))
  assert.ok(html.includes('<pre><code class="language-javascript">const x = 1;</code></pre>'))
})
