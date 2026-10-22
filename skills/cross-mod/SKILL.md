---
name: cross-mod
description: Hub for building plugins that run in both Claude Code and Google Antigravity (agy) with the Bifrost framework. Use when starting any plugin work in this repository to find the right specialized skill and the end-to-end workflow.
---

# Cross-harness plugin hub

A plugin in this repository is written once with Bifrost (`@gidragir/bifrost`): `src/plugin.tsx` holds
`definePlugin({ panes, commands, claude, config })`, state atoms and a React-like UI. `bifrost build`
produces `plugins/<mod>/dist/`, the installable plugin for Claude Code (TUI pane, hooks) and
Antigravity (aux-pane webview, skills, rules).

| Skill | Use it for |
| --- | --- |
| [`bifrost-framework`](../../.agents/skills/bifrost-framework/SKILL.md) | `definePlugin`, `atom`/`useAtom`, `Host`, primitives and components, the CLI |
| [`mod-scaffolding`](../../.agents/skills/mod-scaffolding/SKILL.md) | `pnpm new`, the plugin layout, what goes where |
| [`claude-code-mod`](../../.agents/skills/claude-code-mod/SKILL.md) | Claude Code engine rules, what the adapter guarantees, raw `src/claude.ts` |
| [`agy-pane`](../../.agents/skills/agy-pane/SKILL.md) | The Antigravity adapter: server, page runtime, effects, token, linking |
| [`cross-mod-testing`](../../.agents/skills/cross-mod-testing/SKILL.md) | Bun tests with the test kit, engine tests, typecheck, lint |
| [`plugin-distribution`](../../.agents/skills/plugin-distribution/SKILL.md) | Dev links, release branches, marketplace, publishing the framework |
| [`releasing`](../../.agents/skills/releasing/SKILL.md) | Releasing plugins and the framework: checks, tags, verification, failed runs |

## Workflow

1. `pnpm new <mod> "what it does"` (or edit an existing plugin).
2. Pure logic in `src/*.ts` (files through `FsLike`), Bun tests in `test/*.test.ts`.
3. State, panes, commands and Claude events in `src/plugin.tsx`; UI from Bifrost components.
4. `pnpm dev <mod>` and `bun test` in the plugin folder while editing.
5. Engine scenarios in `test/engine/*.ts`; `pnpm check <mod>` until build, validate, tsc and tests pass.
6. `skills/<mod>/SKILL.md` with a `[Label](sidecar://<mod>/)` pill; `rules/AGENTS.md` if the plugin
   needs agent rules.
7. `pnpm lint`, `bun test`; live check with `pnpm dev:link:desktop` / `pnpm dev:link:agy`.
8. Bump `version` in `definePlugin`, `pnpm marketplace`, tag `<mod>-v<version>`.

"agy" is our name for Antigravity (adapter, scripts, docs). Antigravity's own contract keeps
`sidecar.json`, `sidecars/<id>/`, `window.sidecar`, `ANTIGRAVITY_SIDECAR_*` and `sidecar://` pills.
