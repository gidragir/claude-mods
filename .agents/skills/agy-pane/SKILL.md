---
name: agy-pane
description: The Google Antigravity (agy) side of a Bifrost plugin - what the pane does with its components, config, prompt effects and selection, linking into ~/.gemini/config, and debugging. Use when one plugin's Antigravity pane misbehaves or when linking plugins into Antigravity.
---

# Antigravity (agy) pane

Plugins do not write a server or HTML: `bifrost build` emits `dist/sidecars/<mod>/server.mjs` (one
self-contained bundle: plugin + framework + CSS + page runtime) and `sidecar.json` (one aux-pane view per
pane). The UI is the plugin's own components, rendered on the server.

## What a plugin controls

- The UI: the plugin's components, rendered to HTML on the server. Keep `key`s on `Button`/`Input`/`Select`
  stable: the page posts events back by key.
- `host.selection()` in a handler is the text selected in the pane when the button was pressed.
- Config: env `<PLUGIN>_<KEY>` (e.g. `REF_PANE_PREFIXES`), else the `config` default.
- `host.prompt.*` lands in the chat (insert, clipboard fallback), `submit` sends the message; `toast`
  works; `pane.*` and `scrollTo` are no-ops here.
- `pnpm dev <mod>` restarts the pane process on every build; the page re-renders.

Routes, token, preload, effects plumbing and CSS belong to the framework
([packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md), skill `bifrost-agy-adapter`). A pane
that misbehaves for every plugin is a framework task, not a plugin fix.

## Linking

`pnpm dev:link:agy [mod…]` creates junctions `~/.gemini/config/plugins/<mod>` → `plugins/<mod>/dist`
and `~/.gemini/config/sidecars/<mod>` → `plugins/<mod>/dist/sidecars/<mod>` (building first if needed;
replacing this repo's stale links, never touching others). `pnpm dev:unlink:agy` removes them.

## Debugging

- Run the built server by hand: `ANTIGRAVITY_SIDECAR_WEB_PORT=4700 node dist/sidecars/<mod>/server.mjs`,
  open `http://127.0.0.1:4700/`.
- `curl -X POST :4700/_bf/render -d '{"pane":"<id>","initial":true}'` shows the HTML and effects.
- Plugin tests: `mount(plugin, pane, { harness: 'agy' }).html()`.
