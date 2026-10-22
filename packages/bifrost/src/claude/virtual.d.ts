// Generated per plugin by `bifrost build` (see cli/codegen.ts): literal engine atoms behind a switch,
// because the engine's scanner only accepts `read`/`update` on atoms it can name.
declare module 'virtual:bifrost/claude-state' {
  import type { EngineInterface } from 'claude-code'
  /** Keys the build generated an engine atom for. */
  export const CELLS: ReadonlySet<string>
  export function readCell($: EngineInterface, key: string): Promise<unknown>
  export function writeCell($: EngineInterface, key: string, fn: (prev: unknown) => unknown): Promise<unknown>
}
