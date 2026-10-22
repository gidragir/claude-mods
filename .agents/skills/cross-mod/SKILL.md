---
name: cross-mod
description: Hub for building plugins that run in both Claude Code and Google Antigravity (agy) with the Bifrost framework. Use when starting any plugin work under plugins/<mod> to find the right specialized skill and the end-to-end workflow, including when the plugin seems to need something Bifrost lacks.
---

# Cross-harness plugin hub

A plugin in this repository is written once with Bifrost (`@gidragir/bifrost`): `src/plugin.tsx` holds
`definePlugin({ panes, commands, claude, config })`, state atoms and a React-like UI. `bifrost build`
produces `plugins/<mod>/dist/`, the installable plugin for Claude Code (TUI pane, hooks) and
Antigravity (aux-pane webview, skills, rules).

| Skill | Use it for |
| --- | --- |
| [`bifrost-framework`](../bifrost-framework/SKILL.md) | `definePlugin`, `atom`/`useAtom`, `Host`, primitives and components, the CLI |
| [`mod-scaffolding`](../mod-scaffolding/SKILL.md) | `pnpm new`, the plugin layout, what goes where |
| [`claude-code-mod`](../claude-code-mod/SKILL.md) | Claude Code engine rules as they affect a plugin, raw `src/claude.ts` |
| [`agy-pane`](../agy-pane/SKILL.md) | A plugin's Antigravity pane: config, effects, linking, debugging |
| [`cross-mod-testing`](../cross-mod-testing/SKILL.md) | Bun tests with the test kit, engine tests, typecheck, lint |
| [`plugin-distribution`](../plugin-distribution/SKILL.md) | Dev links, release branches, marketplace |
| [`releasing`](../releasing/SKILL.md) | Releasing plugins and the framework: checks, tags, verification, failed runs |

## Plugin work stays in the plugin

Plugin tasks change `plugins/<mod>/` (and the generated registries) only. Bifrost is used through its
public API, as if installed from npm. Developing Bifrost itself is a separate job with its own
instructions: [packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md).

When the plugin needs something Bifrost does not offer:

1. Build it inside the plugin from the public API: a component in `plugins/<mod>/src/` composed of
   primitives (`Text`, `Box`, …), a helper in the plugin's `src/*.ts`.
2. Claude-only engine feature: `src/claude.ts` (see `claude-code-mod`).
3. Impossible with the public API (a missing Host capability or primitive): stop and tell the user it is
   a framework request, with the proposed API. Do not edit `packages/bifrost` from a plugin task.

"It is generic, it belongs in the framework" is a framework decision, made later in a framework task
(usually once a second plugin needs it). It is not a reason to touch `packages/bifrost` now.

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
