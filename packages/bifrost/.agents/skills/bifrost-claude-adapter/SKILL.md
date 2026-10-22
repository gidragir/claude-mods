---
name: bifrost-claude-adapter
description: Use when changing packages/bifrost/src/claude or src/cli codegen, or when a generated hooks module fails claude plugin validate/test for a reason the framework (not the plugin) causes - scanner errors, missing state contract keys, guard hooks, next(e) chaining.
---

# Claude Code adapter

`bifrost build` generates `dist/hooks/index.js` per plugin. The engine scans it before running it
(`claude plugin validate dist` prints the scan); the adapter and codegen must keep every rule.

| Engine rule | Where Bifrost meets it |
| --- | --- |
| `on('<event>', …)`: literal event names | `claude/index.ts` registers every event literally; matcher values (`{ command }`, `{ requestId }`) may vary |
| `read`/`update` only on literal `atom({ plugin, key })` consts | `cli/codegen.ts` lists the plugin's atoms and emits `virtual:bifrost/claude-state` (a `switch` per key) |
| `$` only as `$.noun.verb(...)` or passed to a top-level function | `claudeHost($)` wraps every call; plugin code never sees `$` |
| `export const register = (on, options) => …` | `claudeEntry` + `fixRegisterExport` (esbuild's `var` patched back to `const`) |
| state keys declared in the manifest's `types` contract | `stateContract` → `dist/types/state.d.ts` (`interface PluginState`) |
| guard hooks need `.catch`, unhandled events call `next(e)` | `install`: `.catch(($, e, next) => next.called ? next(e) : …)` |

Also kept by `install`: `Button` children flattened to text, `Input`/`Select` dropped where a surface lacks
them, `config.set` values in a session config cell (blank = unset), `session.start` command registration.

## Runtime limits the adapter must respect

Sandbox without Node, DOM or timers; ~5000 ms heartbeat per event; surfaces `terminal`, `desktop`,
`vscode`, `mobile` (`canInput` false on mobile); `wide` from 90 columns; state in engine atoms survives hot
reload, not a new session.

## Verifying

- `cli.test.ts` asserts the generated text (literal atoms, `const register`, contract).
- The real proof is the engine: `pnpm check` builds every plugin and runs `claude plugin validate` and
  `claude plugin test`. A scan failure there after a framework change is a framework bug.
- `pnpm types:sync` refreshes `types/engine` when the engine's declarations change.
