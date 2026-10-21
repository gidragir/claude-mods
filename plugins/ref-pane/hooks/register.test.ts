import { expect, test } from 'claude-code/testing'

// `/ref` with no arguments calls $.ui.open, which has no implementation in the test engine, so we check the "ID not found" branch.
test('/ref with an ID missing from the artifacts says so and shows where it searched', async $ => {
  const { text } = await $.command.run({
    command: 'ref',
    args: 'RV-1',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(text?.startsWith('Not found: RV-001. Searched in:')).toBe(true)
})
