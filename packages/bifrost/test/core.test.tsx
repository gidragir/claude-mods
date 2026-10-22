import { expect, test } from 'bun:test'
import { atom, Box, Button, definePlugin, MemoryStore, Text, useAtom, useHost, useState, useViewport } from '@gidragir/bifrost'
import { mount } from '@gidragir/bifrost/testing'
import { renderComponent } from '../src/core/render'
import { textOf } from '../src/core/vnode'
import { createTestHost } from '../src/testing'

const VP = { harness: 'test', surface: 'terminal', columns: 80, canInput: true, wide: false } as const

test('atom: one per key, the first initial wins, bad keys refused', () => {
  const a = atom('core-a', 1)
  expect(atom('core-a', 2)).toBe(a)
  expect(a.initial).toBe(1)
  expect(() => atom('bad key', 0)).toThrow()
})

test('MemoryStore: initial until written, updaters, change notification', async () => {
  const s = new MemoryStore()
  const a = atom('core-store', 10)
  const seen: string[] = []
  s.subscribe(k => seen.push(k))
  expect(await s.get(a)).toBe(10)
  await s.set(a, n => n + 1)
  await s.set(a, 11)
  expect(await s.get(a)).toBe(11)
  expect(seen).toEqual(['core-store'])
})

test('JSX: function tags get key as a prop; fragments flatten; holes drop out', () => {
  const Item = (p: { key?: string; label: string }) => <Text>{`${p.key}:${p.label}`}</Text>
  const tree = (
    <Box>
      {[<Item key="a" label="x" />, false, null]}
      {/* biome-ignore lint/complexity/noUselessFragments: the fragment is what is under test */}
      <>
        <Text>tail</Text>
      </>
    </Box>
  )
  expect(textOf(tree)).toBe('a:xtail')
})

const plugin = definePlugin({ name: 'core-demo', version: '1.0.0', description: 'test', panes: { main: { component: () => null } } })

test('renderComponent: reads a newly used atom and renders again with its value', async () => {
  const host = createTestHost(plugin)
  const late = atom('core-late', 'initial')
  await host.set(late, 'stored')
  const known = new Map()
  let passes = 0
  const Comp = () => {
    passes++
    const [v] = useAtom(late)
    return <Text>{v}</Text>
  }
  expect(textOf(await renderComponent(Comp, { host, viewport: VP, known }))).toBe('stored')
  expect(passes).toBe(2)
  // the pane remembers the atom: one pass from now on
  await renderComponent(Comp, { host, viewport: VP, known })
  expect(passes).toBe(3)
})

test('renderComponent: a throwing component draws an error notice instead of failing', async () => {
  const host = createTestHost(plugin)
  const boom = () => {
    throw new Error('boom')
  }
  const tree = await renderComponent(boom, { host, viewport: VP, known: new Map(), label: 'demo' })
  expect(textOf(tree)).toBe('demo failedboom')
})

test('hooks outside a render throw a clear error', () => {
  expect(() => useHost()).toThrow(/outside a component render/)
})

test('useState, useViewport and handlers through the test kit', async () => {
  const p = definePlugin({
    name: 'core-counter',
    version: '1.0.0',
    description: 'test',
    panes: {
      main: {
        component: () => {
          const [n, setN] = useState('core-n', 0)
          const { wide, columns } = useViewport()
          return (
            <Box>
              <Text>{`n=${n} wide=${wide} cols=${columns}`}</Text>
              <Button key="inc" onPress={() => setN(x => x + 1)}>
                +1
              </Button>
            </Box>
          )
        },
      },
    },
  })
  const ui = await mount(p, 'main', { columns: 120 })
  expect(ui.text()).toBe('n=0 wide=true cols=120+1')
  await ui.press('inc')
  await ui.press('inc')
  expect(ui.find({ type: 'Text' })?.children).toEqual(['n=2 wide=true cols=120'])
})
