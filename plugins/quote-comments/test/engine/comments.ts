// Engine tests: run by `claude plugin test` against the built plugin (bifrost build copies them to dist/tests).
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
  expect((await ui.find({ key: 'pick' }))?.props.label).toBe('+ Paste Quote')
  await ui.press({ key: 'pick' })
  expect((await ui.find({ key: 'quote' }))?.type).toBe('Input')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ key: 'pick' }))?.props.label).toBe('+ Add Comment')
  await term.unmount()
})

test('Append all to Chat submits the comments when prompt box is empty', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'retry three times', requestId: 'msg-1' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: true }))
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })

  await $.command.run({ ...RUN, args: 'why three?' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ key: 'send' })).toBeDefined()
  expect((await ui.find({ key: 'send' }))?.props.label).toBe('Append all to Chat')
  await ui.press({ key: 'send' })
  expect(sent).toBe('Comments on fragments of the conversation:\n\n**[1]**\n> retry three times\n\nwhy three?')
  await ui.unmount()
})

test('Append all to Chat combines existing prompt text with comments and clears prompt', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'retry three times', requestId: 'msg-1' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.read', () => ({ value: { text: 'draft in box', cursor: 12 } }))
  let filled = ''
  on('prompt.fill', (_$, e) => {
    filled = e.text
    return { isFilled: true }
  })
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })

  await $.command.run({ ...RUN, args: 'why three?' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'send' })
  expect(sent).toBe('draft in box\n\nComments on fragments of the conversation:\n\n**[1]**\n> retry three times\n\nwhy three?')
  expect(filled).toBe('')
  await ui.unmount()
})

test('allows editing a saved comment note and saving the updated note', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'code fragment', requestId: 'msg-2' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })

  await $.command.run({ ...RUN, args: 'initial note' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'edit-1' })).toBeDefined()
  expect((await ui.find({ key: 'edit-1' }))?.props.label).toBe('Edit')
  expect((await ui.find({ key: 'del-1' }))?.props.label).toBe('Delete')
  expect((await ui.find({ key: 'go-1' }))?.props.label).toBe('↗ Jump')

  // Click edit button to switch into editing mode
  await ui.press({ key: 'edit-1' })
  expect(await ui.find({ key: 'edit-note-1' })).toBeDefined()
  expect(await ui.find({ key: 'save-1' })).toBeDefined()
  expect(await ui.find({ key: 'cancel-1' })).toBeDefined()

  // Update note via input submit
  await ui.input({ key: 'edit-note-1', text: 'modified note' })
  // Edit mode should be closed after submit
  expect(await ui.find({ key: 'edit-note-1' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: 'modified note' })).toBeDefined()

  // Submit prompt to verify the updated note is carried in the comment block
  await $.prompt.submit({ text: 'send changes', wait: false, origin: { kind: 'plugin', name: 'test' } })
  expect(sent).toBe('send changes\n\nComments on fragments of the conversation:\n\n**[1]**\n> code fragment\n\nmodified note')
  await ui.unmount()
})

test('allows cancelling comment editing without altering the note', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'code fragment', requestId: 'msg-3' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'keep this note' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit-1' })
  expect(await ui.find({ key: 'cancel-1' })).toBeDefined()

  await ui.press({ key: 'cancel-1' })
  expect(await ui.find({ key: 'edit-note-1' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: 'keep this note' })).toBeDefined()
  await ui.unmount()
})

test('allows deleting a comment from the list', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'delete me', requestId: 'msg-4' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'delete note' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'del-1' })).toBeDefined()

  await ui.press({ key: 'del-1' })
  expect(await ui.find({ key: 'card-1' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: /Select text in the chat/ })).toBeDefined()
  await ui.unmount()
})

test('allows saving edit via the Save button with updated text', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'code fragment', requestId: 'msg-5' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'original' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit-1' })
  expect(await ui.find({ key: 'save-1' })).toBeDefined()

  // Type new note with change kind, then click Save
  await ui.input({ key: 'edit-note-1', text: 'saved via button', kind: 'change' })
  await ui.press({ key: 'save-1' })
  expect(await ui.find({ key: 'edit-note-1' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: 'saved via button' })).toBeDefined()
  await ui.unmount()
})

test('switching between comment edits directly changes active edit target', async ($, on) => {
  let count = 0
  on('ui.selection', () => {
    count++
    return { value: { text: `fragment ${count}`, requestId: `msg-${count}` } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'note 1' })
  await $.command.run({ ...RUN, args: 'note 2' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // Enter edit mode on comment 1
  await ui.press({ key: 'edit-1' })
  expect(await ui.find({ key: 'edit-note-1' })).toBeDefined()
  expect(await ui.find({ key: 'edit-note-2' })).toBe(undefined)

  // Switch directly to editing comment 2
  await ui.press({ key: 'edit-2' })
  expect(await ui.find({ key: 'edit-note-1' })).toBe(undefined)
  expect(await ui.find({ key: 'edit-note-2' })).toBeDefined()

  // Save comment 2
  await ui.input({ key: 'edit-note-2', text: 'updated note 2' })
  expect(await ui.find({ key: 'edit-note-2' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: 'updated note 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'note 1' })).toBeDefined()
  await ui.unmount()
})

test('editing a comment clears pending draft to prevent focus conflict', async ($, on) => {
  let callCount = 0
  on('ui.selection', () => {
    callCount++
    if (callCount === 1) return { value: { text: 'existing quote', requestId: 'msg-ex' } }
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'saved note' })
  // Start draft via pick (+ Paste Quote)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'pick' })
  expect(await ui.find({ key: 'quote' })).toBeDefined()

  // Now click Edit on the existing comment
  await ui.press({ key: 'edit-1' })
  expect(await ui.find({ key: 'quote' })).toBe(undefined)
  expect(await ui.find({ key: 'edit-note-1' })).toBeDefined()
  await ui.unmount()
})

test('submitting empty note during edit retains the previous note', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'code fragment', requestId: 'msg-6' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'valuable note' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit-1' })

  await ui.input({ key: 'edit-note-1', text: '   ' })
  expect(await ui.find({ key: 'edit-note-1' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: 'valuable note' })).toBeDefined()
  await ui.unmount()
})

test('Clear all removes all comments and resets edit mode and draft', async ($, on) => {
  on('ui.selection', () => ({ value: { text: 'code fragment', requestId: 'msg-7' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.command.run({ ...RUN, args: 'note 1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'clear' })).toBeDefined()
  expect((await ui.find({ key: 'clear' }))?.props.label).toBe('Clear all')

  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'card-1' })).toBe(undefined)
  expect(await ui.find({ key: 'send' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: /Select text in the chat/ })).toBeDefined()
  await ui.unmount()
})
