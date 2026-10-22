import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { boundTraversalByRecency, defineMod, findFiles, HeadlessStore, safeList, safeRead } from '../dist/core.js'

test('FsLike helpers: safeList and safeRead handle valid and invalid calls gracefully', async () => {
  const mockFs = {
    async list(path) {
      if (path === '/valid') {
        return [
          { name: 'file1.txt', kind: 'file' },
          { name: 'file2.md', kind: 'file' },
          { name: 'sub', kind: 'dir' },
        ]
      }
      throw new Error('Directory not found')
    },
    async read(path) {
      if (path === '/valid/file1.txt') return 'Hello World'
      throw new Error('File not found')
    },
  }

  // safeList
  const validList = await safeList(mockFs, '/valid')
  assert.equal(validList.length, 3)
  const invalidList = await safeList(mockFs, '/nonexistent')
  assert.deepEqual(invalidList, [])

  // safeRead
  const content = await safeRead(mockFs, '/valid/file1.txt')
  assert.equal(content, 'Hello World')
  const empty = await safeRead(mockFs, '/missing.txt')
  assert.equal(empty, '')

  // findFiles
  const mdFiles = await findFiles(mockFs, '/valid', e => e.name.endsWith('.md'))
  assert.deepEqual(mdFiles, ['/valid/file2.md'])
})

test('boundTraversalByRecency caps items by modification timestamp descending', () => {
  const items = [
    { name: 'old', mtime: 100 },
    { name: 'newest', mtime: 500 },
    { name: 'mid', mtime: 300 },
  ]

  const capped = boundTraversalByRecency(items, x => x.mtime, 2)
  assert.equal(capped.length, 2)
  assert.equal(capped[0].name, 'newest')
  assert.equal(capped[1].name, 'mid')
})

test('HeadlessStore manages state transitions and dispatches to listeners', () => {
  const initialState = { count: 0 }
  const reducer = (state, action) => {
    switch (action.type) {
      case 'inc':
        return { count: state.count + 1 }
      case 'set':
        return { count: action.value }
      default:
        return state
    }
  }

  const store = new HeadlessStore(initialState, reducer)
  assert.deepEqual(store.getState(), { count: 0 })

  const recorded = []
  const unsubscribe = store.subscribe(s => recorded.push(s.count))

  store.dispatch({ type: 'inc' })
  store.dispatch({ type: 'set', value: 42 })

  assert.deepEqual(recorded, [1, 42])
  assert.deepEqual(store.getState(), { count: 42 })

  unsubscribe()
  store.dispatch({ type: 'inc' })
  assert.deepEqual(recorded, [1, 42])
  assert.deepEqual(store.getState(), { count: 43 })
})

test('defineMod returns structured ModConfig schema', () => {
  const config = defineMod({
    name: 'test-mod',
    displayName: 'Test Mod',
    version: '1.0.0',
    description: 'Testing defineMod',
    sidecar: {
      enabled: true,
      title: 'Test Sidecar',
    },
    commands: [{ name: 'testcmd', description: 'Run test command' }],
  })

  assert.equal(config.name, 'test-mod')
  assert.equal(config.sidecar?.enabled, true)
  assert.equal(config.commands?.length, 1)
})
