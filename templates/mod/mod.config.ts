import { defineMod } from '@gidragir/bifrost'

export default defineMod({
  name: '__MOD_NAME__',
  displayName: '__MOD_NAME__',
  version: '0.1.0',
  description: '__MOD_DESCRIPTION__',
  sidecar: {
    enabled: true,
    title: '__MOD_NAME__',
    entrypoint: 'SIDECAR_UI_ENTRYPOINT_AUX_PANE',
  },
  commands: [{ name: '__MOD_NAME__', description: 'Run __MOD_NAME__ command' }],
})
