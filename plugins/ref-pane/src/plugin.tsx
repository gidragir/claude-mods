import { definePlugin } from '@gidragir/bifrost'
import { discover, items, learnRoots, lookup, query, selected } from './store'
import { RefsPane } from './ui'

export default definePlugin({
  name: 'ref-pane',
  displayName: 'Refs Pane',
  version: '0.4.0',
  description: 'A pane of references like RV-1/FB-2/T-3 from the model reply: shows the ticket artifact section right in the session',
  suggestedPrompts: ['Show artifact reference RV-1', 'List all references mentioned in the latest review', 'Open the Refs auxiliary pane'],
  config: {
    prefixes: {
      type: 'string',
      title: 'Artifact prefixes',
      description:
        'Custom comma-separated list of PREFIX=dir entries (1–4 uppercase Latin letters), for example: RV=review, FB=feedback, T=tasklist. Without an equals sign, the directory is the lowercase prefix. Replaces the default set (RV, FB, T, TASK, ADR, DBG, OQ, BQ, RD, D, Q, FR, NFR, AC, US); empty means the defaults are used.',
      default: '',
    },
  },

  panes: {
    refs: {
      title: 'Refs',
      component: RefsPane,
      onOpen: async host => {
        if ((await host.get(items)).length === 0) await discover(host)
      },
    },
  },

  commands: {
    ref: {
      description: 'Show an artifact section by reference: /ref RV-1 (no argument: open the pane)',
      argumentHint: '[RV-1 ...]',
      run: async (host, args) => {
        const hit = await lookup(host, args)
        if (hit) {
          if (hit.found.length === 0) return `Not found: ${hit.ids.join(', ')}. Searched in: ${hit.searched.join(', ')}`
          await host.set(selected, hit.found[0]!.id)
          await host.set(query, '')
        }
        await host.pane.open('refs', { focus: true })
        return 'Refs pane opened.'
      },
    },
  },

  claude: {
    promptSubmit: async (host, e) => {
      await learnRoots(host, e.text)
      return undefined
    },
    // References in the main loop's answer land in the pane; the pane opens when one is new.
    turnComplete: async (host, e) => {
      await learnRoots(host, e.answer)
      if (e.agentId !== undefined) return
      const hit = await lookup(host, e.answer)
      if (hit?.fresh) await host.pane.open('refs')
    },
    // New prefixes may define references the old set did not: look again.
    configChange: async (host, key) => {
      if (key === 'prefixes') await discover(host, true)
    },
  },
})
