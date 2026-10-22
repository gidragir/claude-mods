import { expect, test } from 'bun:test'
import { noteFrom, titleOf } from '../src/notes'

test('noteFrom: blank input makes no note', () => {
  expect(noteFrom('  ', 1)).toBe(undefined)
  expect(noteFrom(' buy milk ', 2)).toEqual({ id: 'N-2', text: 'buy milk' })
})

test('titleOf: the first line', () => {
  expect(titleOf({ id: 'N-1', text: 'a\nb' })).toBe('a')
})
