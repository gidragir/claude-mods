import { expect, test } from 'bun:test'
import { createTestHost, mount, runCommand, submitPrompt } from '@gidragir/bifrost/testing'
import plugin from '../src/plugin'
import { comments } from '../src/store'

test('/comment with a note saves it; the next message carries it and the list empties', async () => {
  const host = createTestHost(plugin, { selection: 'retry three times' })
  expect(await runCommand(plugin, 'comment', 'why three?', { host })).toBe(undefined)
  expect(host.calls.toasts).toEqual(['Comment saved: 1 comment for your next message'])
  expect(await submitPrompt(plugin, 'please fix', { host })).toBe(
    'please fix\n\nComments on fragments of the conversation:\n\n**[1]**\n> retry three times\n\nwhy three?',
  )
  expect(await host.get(comments)).toEqual([])
  expect(host.calls.closed).toEqual(['quote-comments'])
})

test('slash commands go through untouched', async () => {
  const host = createTestHost(plugin, { selection: 'x' })
  await runCommand(plugin, 'comment', 'note', { host })
  expect(await submitPrompt(plugin, '/help', { host, command: 'help' })).toBe('/help')
})

test('without a selection the pane asks for a paste, then the note', async () => {
  const host = createTestHost(plugin)
  await runCommand(plugin, 'comment', '', { host })
  const ui = await mount(plugin, 'quote-comments', { host, surface: 'vscode' })
  expect(ui.find({ text: /not shared here/ })).toBeDefined()
  await ui.submit('quote', 'retry three times')
  expect(ui.find({ text: 'Commenting on: “retry three times”' })).toBeDefined()
  await ui.submit('note', 'why three?')
  expect(ui.find({ text: '1 comment will be appended to your next message.' })).toBeDefined()
})

test('Append all to Chat sends the prompt box text with the comments', async () => {
  const host = createTestHost(plugin, { selection: 'code' })
  await runCommand(plugin, 'comment', 'looks off', { host })
  host.promptText = 'draft'
  const ui = await mount(plugin, 'quote-comments', { host })
  await ui.press('send')
  expect(host.calls.submitted).toEqual(['draft\n\nComments on fragments of the conversation:\n\n**[1]**\n> code\n\nlooks off'])
  expect(host.promptText).toBe('')
})

test('in agy the pane is paste-only and renders as HTML', async () => {
  const host = createTestHost(plugin, { harness: 'agy' })
  const ui = await mount(plugin, 'quote-comments', { host })
  expect(ui.find({ key: 'pick' })?.props).toMatchObject({ hotkey: 'c' })
  expect(ui.html()).toContain('+ Paste Quote')
})
