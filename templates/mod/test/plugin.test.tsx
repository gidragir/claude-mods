import { expect, test } from 'bun:test'
import { createTestHost, mount, runCommand } from '@gidragir/bifrost/testing'
import plugin from '../src/plugin'

test('the command adds a note and opens the pane', async () => {
  const host = createTestHost(plugin)
  expect(await runCommand(plugin, '__MOD_NAME__', 'buy milk', { host })).toBe('Noted N-1.')
  expect(host.calls.opened).toEqual(['main'])
  const ui = await mount(plugin, 'main', { host, columns: 120 })
  expect(ui.find({ text: '1 note' })).toBeDefined()
  await ui.press('quote')
  expect(host.promptText).toBe('> buy milk\n\n')
})

test('the same pane renders for agy as HTML', async () => {
  const ui = await mount(plugin, 'main', { harness: 'agy' })
  expect(ui.html()).toContain('No notes yet.')
})
