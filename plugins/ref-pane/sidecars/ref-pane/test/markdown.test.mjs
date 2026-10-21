import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderMarkdown } from '../markdown.mjs'

test('renderMarkdown converts headings, lists, inline code and bold', () => {
  const md = `## RV-1 Code Review
- **Status**: Resolved
- **File**: \`server.mjs\`
- Description with ~~old~~ **new** text and [link](https://example.com).
`
  const html = renderMarkdown(md)
  assert.ok(html.includes('<h3><span class="artifact-badge">RV-1</span> Code Review</h3>'))
  assert.ok(html.includes('<ul>'))
  assert.ok(html.includes('<li><strong>Status</strong>: Resolved</li>'))
  assert.ok(html.includes('<code>server.mjs</code>'))
  assert.ok(html.includes('<del>old</del>'))
  assert.ok(html.includes('<a href="https://example.com"'))
})

test('renderMarkdown handles fenced code blocks without escaping', () => {
  const md = '```javascript\nconst a = 1 < 2;\nconsole.log(a);\n```'
  const html = renderMarkdown(md)
  assert.ok(html.includes('<pre class="code-block"><code class="language-javascript">'))
  assert.ok(html.includes('const a = 1 &lt; 2;'))
})

test('renderMarkdown handles tables', () => {
  const md = `| ID | Description |
|---|---|
| T-1 | Implement SSR |
`
  const html = renderMarkdown(md)
  assert.ok(html.includes('<div class="table-wrapper"><table>'))
  assert.ok(html.includes('<th>ID</th>'))
  assert.ok(html.includes('<td><span class="artifact-badge">T-1</span></td>'))
})

test('renderMarkdown handles blockquotes', () => {
  const md = '> Note: Important detail\n> Line 2'
  const html = renderMarkdown(md)
  assert.ok(html.includes('<blockquote><p>Note: Important detail<br/>Line 2</p></blockquote>'))
})
