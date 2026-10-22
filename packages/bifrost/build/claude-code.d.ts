// A stand-in for the engine's declarations, which Claude Code lays at plugin load and which are in neither
// the repository nor CI. It only lets `node build.mjs` emit declarations: the published .d.ts keep their
// `import type … from 'claude-code'` lines, resolved where the engine lays its types.
declare module 'claude-code' {
  // biome-ignore lint/suspicious/noExplicitAny: a stand-in for the engine's types
  type Loose = any
  export type EngineInterface = Loose
  export type RenderElement = Loose
  export type RenderChildren = Loose
  export type On = Loose
}
