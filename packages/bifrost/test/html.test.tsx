import { expect, test } from 'bun:test'
import { Box, Button, Code, Input, Link, Select, Text } from '@gidragir/bifrost'
import { renderHtml } from '../src/agy/html'
import { renderMarkdown } from '../src/agy/markdown'

test('text is escaped everywhere, links only to safe schemes', () => {
  const { html } = renderHtml(
    <Box>
      <Text>{'<script>alert(1)</script>'}</Text>
      {/* biome-ignore lint/security/noScriptUrl: the renderer must neutralize it */}
      <Link href="javascript:alert(1)">x</Link>
      <Code source={'a < b'} language="ts" />
    </Box>,
  )
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('href="#"')
  expect(html).toContain('<code class="language-ts">a &lt; b</code>')
})

test('handlers are registered under keys, or generated ids; duplicates stay unique', () => {
  const calls: string[] = []
  const { html, handlers } = renderHtml(
    <Box>
      <Button key="go" onPress={() => calls.push('go')}>
        Go
      </Button>
      <Button onPress={() => calls.push('anon')}>Anon</Button>
      <Button key="go" onPress={() => calls.push('go2')}>
        Again
      </Button>
      <Input key="q" value={'"x"'} onSubmit={v => calls.push(`q:${v}`)} />
      <Select key="s" options={[{ value: 'a', label: 'A' }]} value="a" onSelect={v => calls.push(`s:${v}`)} />
    </Box>,
  )
  expect([...handlers.keys()]).toEqual(['go', '_0', 'go~', 'q', 's'])
  handlers.get('go~')?.press?.()
  handlers.get('q')?.submit?.('hi')
  handlers.get('s')?.select?.('a')
  expect(calls).toEqual(['go2', 'q:hi', 's:a'])
  expect(html).toContain('value="&quot;x&quot;"')
  expect(html).toContain('<option value="a" selected>A</option>')
})

test('markdown: headings shift down, code is escaped, lists and quotes', () => {
  const html = renderMarkdown('# Title\n\n- one\n- two\n\n> quote\n\n```js\nif (a < b) {}\n```')
  expect(html).toContain('<h2>Title</h2>')
  expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
  expect(html).toContain('<blockquote><p>quote</p></blockquote>')
  expect(html).toContain('<pre><code class="language-js">if (a &lt; b) {}</code></pre>')
})

test('the stylesheet declares only --bf-* properties: agy pushes its theme (--muted, --accent, --border…) onto the root', async () => {
  const css = await Bun.file(new URL('../src/agy/bifrost.css', import.meta.url)).text()
  const declared = [...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1])
  expect(declared.length).toBeGreaterThan(0)
  expect(declared.filter(name => !name!.startsWith('--bf-'))).toEqual([])
})
