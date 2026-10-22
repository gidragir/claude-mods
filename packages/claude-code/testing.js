/**
 * Bridge implementation of claude-code/testing for Bun and Node test runners.
 */

import { strict as assert } from 'node:assert'

let testFn = null
let expectFn = null
let mockFn = null

if (typeof globalThis.Bun !== 'undefined') {
  try {
    const bunTest = await import('bun:test')
    testFn = bunTest.test
    expectFn = bunTest.expect
    mockFn = bunTest.mock
  } catch {}
}

if (!testFn) {
  try {
    const nodeTest = await import('node:test')
    testFn = nodeTest.test
    mockFn = nodeTest.mock
  } catch {}
}

if (!expectFn) {
  expectFn = actual => ({
    toBe(expected) {
      assert.equal(actual, expected)
    },
    toEqual(expected) {
      assert.deepEqual(actual, expected)
    },
    toBeDefined() {
      assert.notEqual(actual, undefined)
    },
    toBeTruthy() {
      assert.ok(actual)
    },
    toBeFalsy() {
      assert.ok(!actual)
    },
  })
}

// When tests require the Claude Code host engine ($ and on),
// skip them gracefully when running in standalone Bun/Node test runners.
// Full engine tests run via `claude plugin test` (pnpm test:claude).
const wrappedTest = Object.assign((name, fn) => {
  if (!testFn) return fn ? fn() : undefined

  if (fn && fn.length > 0) {
    if (typeof testFn.skip === 'function') {
      return testFn.skip(`${name} [requires claude plugin test]`, fn)
    }
  }
  return testFn(name, fn)
}, testFn || {})

export const test = wrappedTest
export const expect = expectFn
export const mock = mockFn || { fn: fn => fn }
