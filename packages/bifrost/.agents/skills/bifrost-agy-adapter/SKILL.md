---
name: bifrost-agy-adapter
description: Use when changing packages/bifrost/src/agy - the generated Antigravity aux-pane server, page runtime client.js, effects, token and preload contract, HTML renderer or bifrost.css - or when an agy pane misbehaves for every plugin rather than one.
---

# Antigravity (agy) adapter

`bifrost build` emits `dist/sidecars/<mod>/server.mjs` (one bundle: plugin + framework + CSS + page
runtime) and `sidecar.json` (one aux-pane view per pane). The server renders the plugin's components.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /`, `GET /pane/<id>` | shell: `/_bf/style.css`, `/preload.js`, `<main id="bf-root" data-pane>`, `/_bf/client.js` |
| `POST /_bf/render` | `{ pane, initial, columns, workspaceUris, selection }` → `{ html, effects, version }`; `initial` runs `onOpen` |
| `POST /_bf/event` | `{ pane, id, kind: press/input/submit/select, value, … }`: runs the handler drawn under that id, then renders |
| `GET /_bf/stream` | SSE `change` when state changes; the page re-renders |
| `GET /preload.js` | `sidecar_sdk/preload.js` if installed, else a built-in `window.sidecar` stand-in (no token) |
| `GET /api/health` | `{ status, name, version }` |

Handler ids are element `key`s (generated otherwise). The handler's host reads the current request from
async context: `host.selection()` is the text selected when the button was pressed.

## Contract

- Loopback only, port `ANTIGRAVITY_SIDECAR_WEB_PORT`; `ANTIGRAVITY_SIDECAR_UI_TOKEN` on every route but
  `/preload.js` (`X-Sidecar-Token` or `?token=`; the shell forwards it to its assets).
- Workspace URIs (`file:///…`, POSIX, Windows) become `host.cwd()`; before the page reports one, process cwd.
- Config: env `<PLUGIN>_<KEY>`, else the `config` default.
- Effects run in the page: `prompt` → `add-chat-context` + `insert-prompt` postMessages and the clipboard;
  `submit` → `window.sidecar.agent.sendMessage`; `toast`; `focus` by element key.
- `dev: true` builds exit when the bundle changes; Antigravity (`restart_policy: always`) restarts them.
- `agy/bifrost.css` maps host theme variables (`--background`, `--foreground`, `--muted-foreground`,
  `--border`, `--accent`) onto the `bf-*` classes `agy/html.ts` emits. The host sets its variables inline
  on the root (`--muted` is a background there): every property the stylesheet declares is `--bf-*`.
- `bifrost build` empties `dist/sidecars/<mod>` instead of deleting it: a running server's cwd cannot be
  removed on Windows.

Changing a route, effect or class name changes generated output: treat it as a breaking change (AGENTS.md).

## Verifying

- `agy.test.tsx`: `createAgyApp(plugin, { token, env, fs })` with an inline fixture plugin.
- By hand: build any plugin, `ANTIGRAVITY_SIDECAR_WEB_PORT=4700 node plugins/<mod>/dist/sidecars/<mod>/server.mjs`,
  `curl -X POST :4700/_bf/render -d '{"pane":"<id>","initial":true}'`.
