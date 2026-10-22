import type { Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { ModItem } from '../types'
import { greeting } from './core'
import { renderMasterDetail } from './ui'

const COMMAND = '__MOD_NAME__'
const PANE = '__MOD_NAME__'
const selected = atom({ plugin: '__MOD_NAME__', key: 'selected' } as const, null)
const items = atom({ plugin: '__MOD_NAME__', key: 'items' } as const, [
  { id: '1', title: 'Welcome to __MOD_NAME__', detail: '__MOD_DESCRIPTION__' },
])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: '__MOD_DESCRIPTION__' })
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const text = greeting(e.args)
    await $.ui.open({ id: PANE, title: '__MOD_NAME__', focus: true }).catch(() => undefined)
    return { text }
  }).catch((_$, e, next) => (next.called ? next(e) : { text: '__MOD_NAME__: command error.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const list = await read($, items).catch(() => [])
    const sel = await read($, selected).catch(() => null)

    return renderMasterDetail<ModItem>({
      elements: els,
      items: list,
      selectedId: sel,
      renderItem: item => <els.Text>{item.title}</els.Text>,
      renderDetail: item => (
        <els.Box flexDirection="column">
          <els.Text bold>{item.title}</els.Text>
          <els.Text dimColor>{item.detail}</els.Text>
        </els.Box>
      ),
      onSelect: id => update($, selected, () => String(id)),
      onBack: () => update($, selected, () => null),
    })
  })
}
