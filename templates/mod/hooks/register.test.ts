import { expect, test } from 'claude-code/testing'

test('/__MOD_NAME__ answers through the engine', async $ => {
  const { text } = await $.command.run({
    command: '__MOD_NAME__',
    args: 'Ann',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(text).toBe('Hello, Ann!')
})
