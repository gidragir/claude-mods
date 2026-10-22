import type { RenderNode } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { type ElementConstructor, renderEmptyState, renderMasterDetail, truncate } from './patterns'

test('truncate: handles short and long text', () => {
  expect(truncate('hello', 10)).toBe('hello')
  expect(truncate('hello world from terminal', 11)).toBe('hello worl…')
  expect(truncate('line1\nline2\tline3', 30)).toBe('line1 line2 line3')
})

test('renderEmptyState: returns box with messages', () => {
  const dummyBox: ElementConstructor = props => ({ type: 'Box', props }) as unknown as RenderNode
  const dummyText: ElementConstructor = props => ({ type: 'Text', props }) as unknown as RenderNode
  const res = renderEmptyState({ Box: dummyBox, Text: dummyText }, 'Nothing here', 'Hint text') as unknown as { type: string }
  expect(res.type).toBe('Box')
})

test('renderMasterDetail: renders master and detail states', () => {
  const dummyBox: ElementConstructor = (props, ...children) => ({ type: 'Box', props, children }) as unknown as RenderNode
  const dummyButton: ElementConstructor = props => ({ type: 'Button', props }) as unknown as RenderNode
  const dummyText: ElementConstructor = props => ({ type: 'Text', props }) as unknown as RenderNode

  const items = [
    { id: '1', title: 'First' },
    { id: '2', title: 'Second' },
  ]

  // Master view
  const master = renderMasterDetail({
    elements: { Box: dummyBox, Button: dummyButton, Text: dummyText },
    items,
    selectedId: null,
    renderItem: item => dummyText({ children: item.title }),
    renderDetail: item => dummyText({ children: item.title }),
    onSelect: () => {},
    onBack: () => {},
  }) as unknown as { type: string }
  expect(master.type).toBe('Box')

  // Detail view
  const detail = renderMasterDetail({
    elements: { Box: dummyBox, Button: dummyButton, Text: dummyText },
    items,
    selectedId: '1',
    renderItem: item => dummyText({ children: item.title }),
    renderDetail: item => dummyText({ children: item.title }),
    onSelect: () => {},
    onBack: () => {},
  }) as unknown as { type: string }
  expect(detail.type).toBe('Box')
})
