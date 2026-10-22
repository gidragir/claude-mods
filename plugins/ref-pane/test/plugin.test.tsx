import { expect, test } from 'bun:test'
import { completeTurn, createTestHost, mount, runCommand } from '@gidragir/bifrost/testing'
import plugin from '../src/plugin'
import { items, selected } from '../src/store'

const REVIEW =
  '# Review\n\n### RV-1: Fix token validation\nCheck the token on all routes.\n\n### RV-2: Junctions on Windows\nUse realpathSync.native.'
const files = { '/ws/features/PROJ-1/review/review.md': REVIEW }

test('/ref with an unknown ID says where it searched', async () => {
  expect(await runCommand(plugin, 'ref', 'RV-9', { files, cwd: '/ws' })).toBe('Not found: RV-009. Searched in: cwd/features')
})

test('/ref finds the sections, selects the first and opens the pane', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws' })
  expect(await runCommand(plugin, 'ref', 'RV-1 RV-2', { host })).toBe('Refs pane opened.')
  expect((await host.get(items)).map(x => x.id)).toEqual(['RV-001', 'RV-002'])
  expect(await host.get(selected)).toBe('RV-001')
  expect(host.calls.opened).toEqual(['refs'])
})

test('opening the empty pane discovers the references near cwd', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws' })
  await runCommand(plugin, 'ref', '', { host })
  expect((await host.get(items)).map(x => x.id)).toEqual(['RV-001', 'RV-002'])
})

test('empty pane: a hint and the search field', async () => {
  const ui = await mount(plugin, 'refs')
  expect(ui.find({ text: /No references yet/ })).toBeDefined()
  expect(ui.find({ key: 'search-input' })).toBeDefined()
})

test('wide pane: cards beside the detail; the filter narrows and Clear resets it', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws' })
  await runCommand(plugin, 'ref', 'RV-1 RV-2', { host })
  const ui = await mount(plugin, 'refs', { host, columns: 120 })
  expect(ui.find({ key: 'pick-RV-001' })).toBeDefined()
  expect(ui.find({ key: 'pick-RV-002' })).toBeDefined()
  await ui.input('search-input', 'junction')
  expect(ui.find({ key: 'pick-RV-001' })).toBe(undefined)
  expect(ui.find({ text: /filtered from 2/ })).toBeDefined()
  await ui.press('clear-filter')
  expect(ui.find({ key: 'pick-RV-001' })).toBeDefined()
})

test('narrow pane: drill-down detail, Add to chat quotes the selection, back to the list', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws' })
  await runCommand(plugin, 'ref', 'RV-1', { host })
  const ui = await mount(plugin, 'refs', { host, columns: 80 })
  expect(ui.find({ text: '[RV-001]' })).toBeDefined()
  host.select('Check the token')
  await ui.press('add-context')
  expect(host.promptText).toBe('\n> **[RV-001]** (features/PROJ-1/review/review.md:3):\n> Check the token\n\n')
  expect(host.calls.toasts).toEqual(['Added selected text from [RV-001] to chat'])
  await ui.press('back')
  expect(ui.find({ key: 'pick-RV-001' })).toBeDefined()
})

test('a model answer citing a new reference fills and opens the pane; a subagent answer does not', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws' })
  await completeTurn(plugin, 'Fixed RV-2.', { host, agentId: 'a1' })
  expect(await host.get(items)).toEqual([])
  await completeTurn(plugin, 'Fixed RV-2.', { host })
  expect((await host.get(items)).map(x => x.id)).toEqual(['RV-002'])
  expect(host.calls.opened).toEqual(['refs'])
})

test('custom prefixes replace the default set', async () => {
  const host = createTestHost(plugin, {
    files: { '/ws/features/P-1/security/sec.md': '### SEC-1: Tokens\nAlways validate.' },
    cwd: '/ws',
    config: { prefixes: 'SEC=security' },
  })
  expect(await runCommand(plugin, 'ref', 'SEC-1', { host })).toBe('Refs pane opened.')
  expect((await host.get(items))[0]?.file).toBe('/ws/features/P-1/security/sec.md')
})

test('agy renders the same pane as HTML', async () => {
  const host = createTestHost(plugin, { files, cwd: '/ws', harness: 'agy' })
  await runCommand(plugin, 'ref', 'RV-1', { host })
  const html = (await mount(plugin, 'refs', { host, columns: 120 })).html()
  expect(html).toContain('data-bf-id="pick-RV-001"')
  expect(html).toContain('<h4>RV-1: Fix token validation</h4>')
})
