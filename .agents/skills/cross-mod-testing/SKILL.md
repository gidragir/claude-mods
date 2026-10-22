---
name: cross-mod-testing
description: Testing Bifrost plugins - Bun tests with the @gidragir/bifrost/testing kit, engine tests run by claude plugin test against the built plugin, type checking and Biome. Use when writing or running tests, debugging a failing check, or deciding which layer a test belongs to.
---

# Testing

| Layer | Where | Runner | What it covers |
| --- | --- | --- | --- |
| Logic | `plugins/<mod>/test/*.test.ts` | `bun test` | pure functions in `src/*.ts` (use `memoryFs` or a hand-written `FsLike`) |
| Plugin | `plugins/<mod>/test/*.test.tsx` | `bun test` | commands, events, panes through the test kit, in both renderings |
| Engine | `plugins/<mod>/test/engine/*.ts` | `claude plugin test dist` (`pnpm check`) | the generated hooks module inside the real engine, on several surfaces |

Framework tests (`packages/bifrost/test`) belong to framework work
([packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md)). `bun test` from the repository root
runs every Bun suite (~100 ms); from a plugin folder it runs that plugin's (its `bunfig.toml` ignores `dist/**`, where engine tests are copied).

## Test kit (`@gidragir/bifrost/testing`)

```ts
import { expect, test } from 'bun:test'
import { completeTurn, createTestHost, mount, runCommand, submitPrompt } from '@gidragir/bifrost/testing'
import plugin from '../src/plugin'

test('…', async () => {
  const host = createTestHost(plugin, { files: { '/ws/features/T-1/review/r.md': '### RV-1 …' }, cwd: '/ws', config: { prefixes: '' } })
  expect(await runCommand(plugin, 'ref', 'RV-1', { host })).toBe('Refs pane opened.')
  const ui = await mount(plugin, 'refs', { host, columns: 120 })   // surface/harness/canInput options too
  host.select('picked text')
  await ui.press('add-context')
  expect(host.promptText).toContain('picked text')
  expect(host.calls.toasts).toEqual([…])
  expect(ui.html()).toContain('data-bf-id="pick-RV-001"')          // agy rendering
})
```

`mount` drives elements by `key`: `press`, `input` (onInput), `submit` (onSubmit), `select`; `find` /
`findAll` by `{ key, type, text }`; `text()`; `rerender()`. The host records `calls.toasts`,
`calls.prompt`, `calls.submitted`, `calls.opened/closed/focused/scrolled`, and keeps `promptText`.

## Engine tests

Files in `test/engine/*.ts` import only `claude-code/testing`; the build copies them to
`dist/tests/*.test.ts`. Mock host answers with `on('ui.open', () => ({ value: { isPlaced: true } }))`,
`on('prompt.fill', () => ({ isFilled: true }))`, `on('fs.list'|'fs.read'|'session.cwd', …)`. Mount panes
with `$.ui.mount({ plugin, component: 'Pane', requestId, surface, props: { bodyColumns, … } })`.
`$.command.run` needs `origin` and `presentation`.

## Checks

- `pnpm check [mod]`: build → `claude plugin validate dist` → `tsc` (src, then `test/tsconfig.json`) →
  `claude plugin test dist`.
- `pnpm typecheck`, `pnpm lint` (Biome), `pnpm test:engine`.
- `types/engine` must exist for `tsc` (`pnpm types:sync`).
