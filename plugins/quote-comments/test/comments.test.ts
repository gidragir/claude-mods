import { expect, test } from 'bun:test'

import { appendComments, countLabel, formatBlock, MAX_QUOTE, preview } from '../src/comments'

const one = { id: 1, quote: 'first line\nsecond line', note: ' looks wrong ' }
const two = { id: 2, quote: 'retry three times', ref: 'toolu_1', note: 'why three?' }

test('preview folds whitespace and cuts long quotes', () => {
  expect(preview('  a\n  b  ')).toBe('a b')
  expect(preview('abcdefghij', 5)).toBe('abcd…')
})

test('formatBlock numbers quotes and keeps multi-line quotes quoted', () => {
  expect(formatBlock([one, two])).toBe(
    'Comments on fragments of the conversation:\n\n' +
      '**[1]**\n> first line\n> second line\n\nlooks wrong\n\n' +
      '**[2]**\n> retry three times\n\nwhy three?',
  )
})

test('formatBlock cuts very long quotes', () => {
  const block = formatBlock([{ id: 1, quote: 'x'.repeat(MAX_QUOTE + 10), note: 'n' }])
  expect(block.includes(`> ${'x'.repeat(MAX_QUOTE)}…`)).toBe(true)
})

test('appendComments keeps the user text first and skips when there is nothing', () => {
  expect(appendComments('hi', [])).toBe('hi')
  expect(appendComments('fix it  \n', [two])).toBe(
    'fix it\n\nComments on fragments of the conversation:\n\n**[1]**\n> retry three times\n\nwhy three?',
  )
  expect(appendComments('', [two]).startsWith('Comments on')).toBe(true)
})

test('countLabel', () => {
  expect(countLabel(1)).toBe('1 comment')
  expect(countLabel(3)).toBe('3 comments')
})
