import { expect, test } from 'bun:test'
import { atom, definePlugin, Markdown, MasterDetail, plural, Text, truncate, useAtom } from '@gidragir/bifrost'
import { mount } from '@gidragir/bifrost/testing'

type Item = { id: string; body: string }
const items: Item[] = [
  { id: 'A-1', body: 'first' },
  { id: 'A-2', body: 'second' },
  { id: 'A-3', body: 'third' },
]
const selected = atom<string | null>('md-selected', null)

const plugin = definePlugin({
  name: 'md-demo',
  version: '1.0.0',
  description: 'test',
  panes: {
    main: {
      component: () => {
        const [sel, setSel] = useAtom(selected)
        return (
          <MasterDetail
            items={items}
            selectedId={sel}
            onSelect={setSel}
            getId={x => x.id}
            meta={x => `${x.body.length} chars`}
            preview={x => <Text dimColor>{x.body}</Text>}
            detail={x => <Markdown text={`# ${x.body}`} />}
          />
        )
      },
    },
  },
})

test('MasterDetail wide: sidebar and the first item in detail; p/n walk around', async () => {
  const ui = await mount(plugin, 'main', { columns: 120 })
  expect(ui.findAll({ type: 'Button', text: /^A-/ }).length).toBe(3)
  expect(ui.find({ type: 'Markdown' })?.props).toEqual({ text: '# first' })
  await ui.press('prev')
  expect(ui.find({ type: 'Markdown' })?.props).toEqual({ text: '# third' })
  await ui.press('next')
  await ui.press('next')
  expect(ui.find({ type: 'Markdown' })?.props).toEqual({ text: '# second' })
})

test('MasterDetail narrow: list first, drill-down with Overview back', async () => {
  const ui = await mount(plugin, 'main', { columns: 60 })
  expect(ui.find({ type: 'Markdown' })).toBe(undefined)
  await ui.press('pick-A-2')
  expect(ui.find({ type: 'Markdown' })?.props).toEqual({ text: '# second' })
  expect(ui.find({ key: 'back' })).toBeDefined()
  // the drill-down keeps a switcher of every item
  expect(ui.findAll({ type: 'Button', text: /^A-/ }).length).toBe(3)
  await ui.press('pick-A-3')
  expect(ui.find({ type: 'Markdown' })?.props).toEqual({ text: '# third' })
  await ui.press('back')
  expect(ui.find({ type: 'Markdown' })).toBe(undefined)
})

test('the same tree renders to HTML for agy: cards are articles, buttons carry their keys', async () => {
  const ui = await mount(plugin, 'main', { columns: 120, harness: 'agy' })
  const html = ui.html()
  expect(html).toContain('<article class="bf-box bf-col bf-frame')
  expect(html).toContain('data-bf-id="pick-A-1"')
  expect(html).toContain('data-bf-hotkey="n"')
  expect(html).toContain('<h2>first</h2>')
})

test('truncate and plural', () => {
  expect(truncate('a  b\nc', 10)).toBe('a b c')
  expect(truncate('abcdefgh', 5)).toBe('abcd…')
  expect(plural(1, 'ref')).toBe('1 ref')
  expect(plural(2, 'ref')).toBe('2 refs')
})
