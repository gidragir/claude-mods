---
name: claude-code-mod
description: Claude Code engine specifics for Bifrost plugins - the hooks-module scanner rules as they affect plugin code, sandbox and heartbeat budget, TUI surfaces, and the raw src/claude.ts escape hatch. Use when a plugin fails claude plugin validate/test, when adding Claude-only behaviour, or when debugging a pane in the terminal/desktop/VS Code.
---

# Claude Code side of a plugin

Plugins do not write a hooks module: `bifrost build` generates `dist/hooks/index.js` from
`src/plugin.tsx`. This skill explains what that module must satisfy and where to look when it does not.

## Engine rules and your plugin

The engine scans the hooks module before running it (`claude plugin validate dist` prints the scan). The
generated module keeps the scanner's rules as long as plugin code keeps these:

| Plugin rule | Scan error when broken |
| --- | --- |
| `atom('key', …)` at module level; `useState('key', …)` with a literal key | state key "not declared", atom "the scan cannot read" |
| Only `@gidragir/bifrost` and own files imported; no `claude-code`, Node or DOM | load or sandbox errors |

If the scan fails while the plugin keeps these rules, the generated module is at fault: that is a framework
bug, reported to the user as a framework task ([packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md)),
not patched from the plugin.

## Runtime

- Sandbox: no Node, no DOM, no timers; plugin code only uses the `Host`.
- ~5000 ms heartbeat: keep handlers bounded (single pass over files, `boundTraversalByRecency`).
- Surfaces: `terminal`, `desktop`, `vscode`, `mobile`. `useViewport().surface` tells which; `canInput` is
  false on mobile (`Field` shows its fallback). VS Code shares no chat selection: offer a paste field.
- Pane width: `useViewport().columns` is the pane body; `wide` from 90 columns (`MasterDetail` switches
  between split and drill-down by it).
- State lives in engine atoms: it survives hot reload, not a new session.
- Claude-only events: `claude.sessionStart`, `promptSubmit`, `turnComplete` (`agentId` set for subagent
  turns), `configChange` (also updates `host.config`).

## Escape hatch: `src/claude.ts`

For engine features the framework does not model (tools, other events), add `src/claude.ts` exporting a
raw `register`. The build bundles it as `dist/hooks/raw.js` next to the generated module. In that file the
engine rules above apply to you directly: literal `on` names, literal atoms, `$` only at call sites, and
a `types` contract entry for any state key it uses (prefer keeping state in the main plugin).

## Debugging

- `pnpm check <mod>`: build, validate (scan output), `tsc`, engine tests.
- Load problems show as a dim line in the transcript; `claude --debug` for details.
- Engine tests in `test/engine/*.ts` (`claude-code/testing`): `$.command.run`, `$.ui.mount({ plugin,
  component: 'Pane', requestId, surface, props })`, `ui.press/input/find` by element `key`.
