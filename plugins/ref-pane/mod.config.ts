import { defineMod } from '@gidragir/bifrost'

export default defineMod({
  name: 'ref-pane',
  displayName: 'Refs Pane',
  version: '0.3.0',
  description: 'A pane of references like RV-1/FB-2/T-3 from the model reply: shows the ticket artifact section right in the session',
  types: './types/index.d.ts',
  author: 'gidragir',
  license: 'MIT',
  repository: 'https://github.com/gidragir/claude-mods',
  suggestedPrompts: ['Show artifact reference RV-1', 'List all references mentioned in the latest review', 'Open the Refs auxiliary pane'],
  sidecar: {
    enabled: true,
    title: 'Refs',
    entrypoint: 'SIDECAR_UI_ENTRYPOINT_AUX_PANE',
  },
  commands: [{ name: 'ref', description: 'Show an artifact section by reference: /ref RV-1 (no argument: open the pane)' }],
  configSchema: {
    prefixes: {
      type: 'string',
      title: 'Artifact prefixes',
      description:
        'Custom comma-separated list of PREFIX=dir entries (1–4 uppercase Latin letters), for example: RV=review, FB=feedback, T=tasklist. Without an equals sign, the directory is the lowercase prefix. Replaces the default set (RV, FB, T, TASK, ADR, DBG, OQ, BQ, RD, D, Q, FR, NFR, AC, US); empty means the defaults are used.',
      default: '',
    },
  },
})
