// Engine test: `claude plugin test` runs it against the built plugin (dist/tests/notes.test.ts).
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: '__MOD_NAME__',
  component: 'Pane',
  requestId: 'main',
  props: { title: '__MOD_NAME__', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the command adds a note the pane lists on every surface', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const { text } = await $.command.run({
    command: '__MOD_NAME__',
    args: 'buy milk',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(text).toBe('Noted N-1.')
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^1 note$/ }))?.text).toBe('1 note')
    await ui.unmount()
  }
})
