import { expect, test } from 'claude-code/testing'

import { greeting } from './core'

test('greeting: default and named', () => {
  expect(greeting('')).toBe('Hello from __MOD_NAME__.')
  expect(greeting(' Ann ')).toBe('Hello, Ann!')
})
