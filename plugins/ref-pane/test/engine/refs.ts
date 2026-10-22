// Engine tests: run by `claude plugin test` against the built plugin (bifrost build copies them to dist/tests).
import type { FsEntry } from 'claude-code'
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

const PANE = {
  plugin: 'ref-pane',
  component: 'Pane',
  requestId: 'refs',
} as const

test('renders empty state when no references found', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /REFS PANE/ }))?.text).toBe('REFS PANE')
  expect(await ui.find({ type: 'Text', text: /No references yet/ })).toBeDefined()
  expect(await ui.find({ key: 'search-input' })).toBeDefined()
  await ui.unmount()
})

test('renders split view (bodyColumns >= 90) and filters items with search input', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => {
    const p = String(e.path ?? '')
    if (p.includes('review')) {
      return { value: [{ name: 'review.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }] }
    }
    return { value: [{ name: 'review', kind: 'dir', size: 0, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', async () => {
    return {
      value:
        '# Review Findings\n\n### RV-1: Fix authentication token validation\nThe token must be checked on all routes.\n\n### RV-2: Handle directory junctions on Windows\nUse realpathSync.native.',
    }
  })

  // Run /ref to discover RV-1 and RV-2
  await $.command.run({
    command: 'ref',
    args: 'features/PROJ-1 RV-1 RV-2',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  // Mount in Split View mode (bodyColumns = 100 >= 90)
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

  // Should have both items visible
  expect(await ui.find({ key: 'pick-RV-001' })).toBeDefined()
  expect(await ui.find({ key: 'pick-RV-002' })).toBeDefined()

  // Detail pane should be mounted with navigation buttons
  expect(await ui.find({ key: 'prev' })).toBeDefined()
  expect(await ui.find({ key: 'next' })).toBeDefined()

  // Filter with search input: filter for RV-2
  await ui.input({ key: 'search-input', text: 'RV-2' })
  expect(await ui.find({ key: 'pick-RV-002' })).toBeDefined()
  expect(await ui.find({ key: 'clear-filter' })).toBeDefined()

  // Clear filter using the clear button
  await ui.press({ key: 'clear-filter' })
  expect(await ui.find({ key: 'pick-RV-001' })).toBeDefined()
  expect(await ui.find({ key: 'pick-RV-002' })).toBeDefined()

  await ui.unmount()
})

test('renders compact Master-Detail view (bodyColumns < 90) with navigation', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => {
    const p = String(e.path ?? '')
    if (p.includes('review')) {
      return { value: [{ name: 'review.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }] }
    }
    return { value: [{ name: 'review', kind: 'dir', size: 0, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', async () => {
    return {
      value:
        '# Review Findings\n\n### RV-1: Fix authentication token validation\nThe token must be checked on all routes.\n\n### RV-2: Handle directory junctions on Windows\nUse realpathSync.native.',
    }
  })

  // Discover items and select RV-1
  await $.command.run({
    command: 'ref',
    args: 'features/PROJ-1 RV-1',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  // Mount in Compact mode (bodyColumns = 80 < 90)
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

  // In detail view: back button and detail header should be present
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(await ui.find({ key: 'add-context' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[RV-001\]/ })).toBeDefined()

  // Press add-context button
  await ui.press({ key: 'add-context' })

  // Press back button to return to master view
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'pick-RV-001' })).toBeDefined()

  await ui.unmount()
})

test('dynamically updates prefixes in same session when config changes', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('config.set', (_$, e) => ({ value: e.value }))
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => {
    const p = String(e.path ?? '')
    if (p.includes('security')) {
      return { value: [{ name: 'sec.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }] }
    }
    return { value: [{ name: 'security', kind: 'dir', size: 0, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', async () => ({
    value: '# Security Findings\n\n### SEC-1: Token validation\nAlways validate tokens.',
  }))

  // Initially SEC is not a recognized prefix, so /ref SEC-1 is not found
  const resBefore = await $.command.run({
    command: 'ref',
    args: 'SEC-1',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(resBefore.text?.startsWith('Not found: SEC-001')).toBe(true)

  // Configure new prefixes in the same session
  await $.config.set({
    key: 'ref-pane.prefixes',
    value: 'SEC=security',
    previous: '',
    provider: { plugin: 'ref-pane', tier: 'core' },
    origin: { kind: 'composer' },
  })

  // Run /ref SEC-1 again in the same session
  const resAfter = await $.command.run({
    command: 'ref',
    args: 'SEC-1',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(resAfter.text).toBe('Refs pane opened.')

  // Mount UI and verify SEC-001 is found and add-context button is available
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await ui.find({ key: 'pick-SEC-001' })).toBeDefined()
  expect(await ui.find({ key: 'add-context' })).toBeDefined()

  // Press Add to chat button
  await ui.press({ key: 'add-context' })

  await ui.unmount()
})

test('/ref without arguments auto-discovers references with newly configured prefixes', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('config.set', (_$, e) => ({ value: e.value }))
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => {
    const p = String(e.path ?? '')
    if (p.includes('security')) {
      return { value: [{ name: 'sec.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }] }
    }
    return { value: [{ name: 'security', kind: 'dir', size: 0, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', async () => ({
    value: '# Security Findings\n\n### SEC-1: Token validation\nAlways validate tokens.',
  }))

  // Configure new prefixes in the session
  await $.config.set({
    key: 'ref-pane.prefixes',
    value: 'SEC=security',
    previous: '',
    provider: { plugin: 'ref-pane', tier: 'core' },
    origin: { kind: 'composer' },
  })

  // Run /ref with NO arguments (just opening/refreshing the pane)
  const res = await $.command.run({
    command: 'ref',
    args: '',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(res.text).toBe('Refs pane opened.')

  // Mount UI and verify SEC-001 was discovered and displayed!
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await ui.find({ key: 'pick-SEC-001' })).toBeDefined()
  await ui.unmount()
})

test('addToChat captures active selection from $.ui.selection()', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('config.set', (_$, e) => ({ value: e.value }))
  let filledPromptText: string | undefined
  on('prompt.fill', (_$, e) => {
    filledPromptText = e.text
    return { isFilled: true }
  })
  on('ui.selection', () => ({
    value: { text: 'Selected critical security snippet' },
  }))
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => {
    const p = String(e.path ?? '')
    if (p.includes('security')) {
      return { value: [{ name: 'sec.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }] }
    }
    return { value: [{ name: 'security', kind: 'dir', size: 0, mtimeMs: 1000, isLink: false }] }
  })
  on('fs.read', async () => ({
    value: '# Security Findings\n\n### SEC-1: Token validation\nFull body text here.',
  }))

  await $.config.set({
    key: 'ref-pane.prefixes',
    value: 'SEC=security',
    previous: '',
    provider: { plugin: 'ref-pane', tier: 'core' },
    origin: { kind: 'composer' },
  })

  await $.command.run({
    command: 'ref',
    args: 'SEC-1',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { title: 'Refs', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

  await ui.press({ key: 'add-context' })
  expect(filledPromptText).toBeDefined()
  expect(filledPromptText?.includes('Selected critical security snippet')).toBe(true)
  expect(filledPromptText?.includes('> **[SEC-001]**')).toBe(true)

  await ui.unmount()
})

test('/ref with empty arguments when no references are discovered opens pane cleanly', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/test-ws' }))
  on('fs.list', async () => ({ value: [] }))

  const res = await $.command.run({
    command: 'ref',
    args: '',
    origin: { kind: 'plugin', name: 'test' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(res.text).toBe('Refs pane opened.')
})
