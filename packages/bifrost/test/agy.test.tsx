import { afterAll, beforeAll, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { atom, Box, Button, definePlugin, Input, Text, useAtom, useHost } from '@gidragir/bifrost'
import { createAgyApp, type Effect, workspacePath } from '../src/agy'
import { memoryFs } from '../src/testing'

const note = atom('agy-note', '')
let opened = 0
const plugin = definePlugin({
  name: 'agy-demo',
  version: '1.0.0',
  description: 'demo',
  config: { mode: { type: 'string', default: 'plain' } },
  panes: {
    main: {
      title: 'Main',
      onOpen: () => {
        opened++
      },
      component: () => {
        const [n, setN] = useAtom(note)
        const host = useHost()
        const quote = async () => {
          const sel = await host.selection()
          await host.prompt.append(`> ${sel?.text ?? n}`)
          host.toast(`mode ${await host.config('mode')} in ${await host.cwd()}`)
        }
        return (
          <Box>
            <Text>{`note=${n}`}</Text>
            <Input key="note" value={n} onSubmit={setN} />
            <Button key="quote" onPress={quote}>
              Quote
            </Button>
          </Box>
        )
      },
    },
  },
})

const app = createAgyApp(plugin, { token: 'secret', env: { AGY_DEMO_MODE: 'fancy' }, fs: memoryFs({}) })
let base = ''
beforeAll(async () => {
  base = `http://127.0.0.1:${await app.start(0)}`
})
afterAll(() => app.stop())

type Reply = { html: string; effects: Effect[]; version: number }
const post = (path: string, body: unknown): Promise<Reply> =>
  fetch(base + path, { method: 'POST', headers: { 'X-Sidecar-Token': 'secret' }, body: JSON.stringify(body) }).then(
    r => r.json() as Promise<Reply>,
  )

test('token: required everywhere but /preload.js', async () => {
  expect((await fetch(`${base}/`)).status).toBe(401)
  expect((await fetch(`${base}/preload.js`)).status).toBe(200)
  const page = await (await fetch(`${base}/?token=secret`)).text()
  expect(page).toContain('<main id="bf-root" data-pane="main">')
  expect(page).toContain('/_bf/client.js?token=secret')
  expect((await fetch(`${base}/_bf/style.css?token=secret`)).headers.get('content-type')).toContain('text/css')
})

test('render, events and effects: selection, config from env, workspace as cwd', async () => {
  const first = await post('/_bf/render', { pane: 'main', initial: true, workspaceUris: ['file:///tmp/ws'] })
  expect(opened).toBe(1)
  expect(first.html).toContain('note=')
  const typed = await post('/_bf/event', { pane: 'main', id: 'note', kind: 'submit', value: 'hello' })
  expect(typed.html).toContain('note=hello')
  const quoted = await post('/_bf/event', { pane: 'main', id: 'quote', kind: 'press', selection: 'picked text' })
  expect(quoted.effects[0]).toEqual({ type: 'prompt', mode: 'append', text: '> picked text' })
  expect(quoted.effects[1]).toMatchObject({ type: 'toast', message: expect.stringContaining('mode fancy in ') })
  expect(quoted.version).toBeGreaterThan(first.version)
})

test('an unknown handler id renders without running anything', async () => {
  const r = await post('/_bf/event', { pane: 'main', id: 'nope', kind: 'press' })
  expect(r.html).toContain('note=hello')
})

test('workspace URIs become local paths', () => {
  expect(workspacePath('https://x')).toBe(undefined)
  const here = resolve('ws')
  expect(workspacePath(pathToFileURL(here).href)).toBe(here)
  expect(workspacePath('relative/dir')).toBe(resolve('relative/dir'))
})
