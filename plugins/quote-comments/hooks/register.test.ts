import { expect, test } from 'claude-code/testing'

const RUN = { command: 'comment', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: true, columns: 120 } } as const

test('/comment with no selection and no pane says how to select', async ($, on) => {
  on('ui.selection', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no-surface' } }))
  const { text } = await $.command.run({ ...RUN, args: 'why?' })
  expect(text?.startsWith('No selection is shared here')).toBe(true)
})

test('/comment <text> saves the comment and the next message carries it', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'retry three times', requestId: 'msg-1' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })

  await $.command.run({ ...RUN, args: 'why three?' })
  await $.prompt.submit({ text: 'please fix', wait: false, origin: { kind: 'plugin', name: 'test' } })
  expect(sent).toBe('please fix\n\nComments on fragments of the conversation:\n\n**[1]**\n> retry three times\n\nwhy three?')

  // the list is cleared after sending
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'plugin', name: 'test' } })
  expect(sent).toBe('next')
})

const PANE = {
  plugin: 'quote-comments',
  component: 'Pane',
  requestId: 'quote-comments',
  props: { title: 'Comments', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the pane takes a comment for the selection and lists it', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'retry three times', requestId: 'msg-1' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ ...RUN, args: '' })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /Commenting on/ }))?.text).toBe('Commenting on: “retry three times”')
      await ui.input({ key: 'note', text: 'why three?' })
    }
    expect((await ui.find({ type: 'Text', text: /will be appended/ }))?.text).toBe('1 comment will be appended to your next message.')
    expect(await ui.find({ key: 'go-1' })).toBeDefined()
    await ui.unmount()
  }
})

test('where no selection is shared, the pane takes a pasted quote, then the comment', async ($, on) => {
  on('ui.selection', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  const { text } = await $.command.run({ ...RUN, args: '' })
  expect(text).toBe(undefined)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /not shared here/ })).toBeDefined()
  await ui.input({ key: 'quote', text: 'retry three times' })
  await ui.unmount()

  const again = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await again.find({ type: 'Text', text: /Commenting on/ }))?.text).toBe('Commenting on: “retry three times”')
  await again.input({ key: 'note', text: 'why three?' })
  expect((await again.find({ type: 'Text', text: /will be appended/ }))?.text).toBe('1 comment will be appended to your next message.')
  // a pasted quote has no row to scroll to
  expect(await again.find({ key: 'go-1' })).toBe(undefined)
  await again.unmount()
})

test('in VS Code the button asks for a paste and opens the paste field', async ($, on) => {
  on('ui.selection', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ key: 'pick' }))?.props.label).toBe('💬 Paste quote')
  await ui.press({ key: 'pick' })
  expect((await ui.find({ key: 'quote' }))?.type).toBe('Input')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ key: 'pick' }))?.props.label).toBe('💬 Comment selection')
  await term.unmount()
})
