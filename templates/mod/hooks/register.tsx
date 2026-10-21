import type { Register } from 'claude-code'

import { greeting } from './core'

const COMMAND = '__MOD_NAME__'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: '__MOD_DESCRIPTION__' })
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const text = greeting(e.args)
    $.ui.toast(text)
    return { text }
  }).catch((_$, e, next) => (next.called ? next(e) : { text: '__MOD_NAME__: command error.' }))
}
