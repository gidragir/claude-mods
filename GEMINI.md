@AGENTS.md

# GEMINI.md

Developer and agent guide for Google Antigravity and Gemini CLI working in this repository.

## Overview

This repository is a dual-target project supporting both **Google Antigravity** (sidecars, skills, and rules) and **Claude Code** (function hook mods), unified by the **Bifrost** (`@gidragir/bifrost`) cross-harness framework.

Antigravity interacts with plugins via:
- **Mod Configuration**: `plugins/<mod>/mod.config.ts` defines metadata, sidecar settings, commands, and suggested prompts using `defineMod(...)`.
- **Plugin Discovery**: `.agents/plugins.json` lists plugin directories (`"path": "plugins"`).
- **Plugin Manifest**: `plugins/<mod>/plugin.json` specifies metadata, display names, and suggested prompts (synchronized via Bifrost).
- **Rules**: `plugins/<mod>/rules/AGENTS.md` automatically injects domain rules (e.g. artifact reference standards `RV-1`, `FB-2`, `T-3`, `ADR-4`) into agent sessions.
- **Skills**: `plugins/<mod>/skills/<name>/SKILL.md` (and workspace skills in `.agents/skills/`) teaches agents when and how to invoke features.
- **Sidecars**: `plugins/<mod>/sidecars/<mod>/` runs background HTTP microservices rendering webviews in the Electron Auxiliary Pane via `@gidragir/bifrost/server`.

### Specialized Agent Skills in this Workspace
- [`.agents/skills/cross-mod/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/cross-mod/SKILL.md) — Master cross-model plugin hub.
- [`.agents/skills/bifrost-framework/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/bifrost-framework/SKILL.md) — `@gidragir/bifrost` core APIs, `FsLike`, `HeadlessStore`, and server factories.
- [`.agents/skills/mod-scaffolding/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/mod-scaffolding/SKILL.md) — Plugin scaffolding with `pnpm new` and `mod.config.ts`.
- [`.agents/skills/claude-code-mod/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/claude-code-mod/SKILL.md) — Claude Code adapter and TUI layouts.
- [`.agents/skills/antigravity-sidecar/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/antigravity-sidecar/SKILL.md) — Auxiliary Pane sidecars and Pico CSS webviews.
- [`.agents/skills/cross-mod-testing/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/cross-mod-testing/SKILL.md) — Hybrid test suite (`bun test`, `pnpm test:claude`, `pnpm test:sidecar`).
- [`.agents/skills/plugin-distribution/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/plugin-distribution/SKILL.md) — Local linking and GitHub Actions release workflows.

## Antigravity Sidecar Architecture with Bifrost

Sidecars provide rich, interactive graphical interfaces within the Antigravity Auxiliary Pane:

### 1. Sidecar Server Implementation (`server.mjs`)
Sidecars use the standardized `createSidecarApp` factory from `@gidragir/bifrost/server`:
```javascript
import { checkIsMain, createSidecarApp } from '@gidragir/bifrost/server'
import { renderMarkdown } from '@gidragir/bifrost/ui'
import { resolveRefs } from '../../hooks/refs.ts'

export function createServer(opts = {}) {
  const app = createSidecarApp({
    name: 'ref-pane-sidecar',
    ...opts,
  })

  // Protected API routes (automatic token authentication)
  app.get('/api/refs', async (req, res) => {
    const refs = await resolveRefs(...)
    app.sendJson(res, 200, { refs })
  })

  return app
}

if (checkIsMain(import.meta.url, process.argv[1])) {
  const app = createServer()
  app.listen(Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0)
}
```

### 2. Node.js 24 Native Type Stripping
`server.mjs` imports the shared pure TypeScript core directly from `../../hooks/*.ts` and Bifrost modules directly from `@gidragir/bifrost/*` without bundling during development. Standalone production bundles can be built with `bun x bifrost build`.

### 3. Environment & Security
- `ANTIGRAVITY_SIDECAR_WEB_PORT`: Server port allocated by Antigravity (or fallback to dynamic port `0`).
- `ANTIGRAVITY_SIDECAR_UI_TOKEN`: Security token. When present, all requests (except `/preload.js`) must validate the `X-Sidecar-Token` header or `?token=` query parameter, returning HTTP 401 if missing or invalid.

### 4. Preload Script & `window.sidecar` Contract
The sidecar serves `/preload.js`, which injects `window.sidecar`:
- `window.sidecar.getWorkspaceUris()`: returns active workspace directories.
- `window.sidecar.onWorkspaceChange(callback)`: subscribes to workspace additions or switches.
- `window.sidecar.fetch(url, opts)`: wrapper that automatically appends the security token header.
- Listens to `message` events: `theme-change` (synchronizes CSS variables to `document.documentElement`) and `workspace-change`.
- Must provide a self-contained fallback preload script if `sidecar_sdk` is not installed.

### 5. Windows Junction & Realpath Handling
- Antigravity registers sidecars via NTFS directory junctions (e.g. `~/.gemini/config/sidecars/<id>`).
- When detecting direct script execution (`checkIsMain`), standard `fs.realpathSync()` on Windows preserves the input drive letter casing (`d:` vs `D:`). To reliably match across junctions, symlinks, and drive casing differences, compare with `realpathSync.native` and use case-insensitive path comparison on Windows (`rArg.toLowerCase() === rThis.toLowerCase()`).
- Workspace paths may be supplied as `file:///...` URIs or Windows paths with backslashes; normalize them using `fileURLToPath()` and `resolve()`.

### 6. Zero-Dependency SSR Markdown
To ensure fast rendering without client-side bundle dependencies:
- Markdown content is parsed and sanitized server-side in `server.mjs` using `markdown.mjs`.
- The webview UI receives pre-rendered HTML in API responses for instant, zero-flicker injection.

### 7. Interactive Navigation Pills
When citing artifacts or guiding the user to inspect a sidecar view, surface a clickable sidecar link in your message:
```markdown
[Open Refs Pane](sidecar://ref-pane/)
```

## Key Commands

- `bun test`: run ultra-fast unit and sidecar test suites via Bun
- `pnpm test:sidecar`: run Node test runner tests for sidecars (`plugins/*/sidecars/*/test/*.test.mjs`)
- `pnpm test:claude`: run Claude Code engine integration tests (`claude plugin test`)
- `pnpm test:all`: run all suites end-to-end (`bun test && pnpm test:claude && pnpm test:sidecar`)
- `bun run build`: build `@gidragir/bifrost` framework and generate `.d.ts` types
- `bun x bifrost build <path>`: compile standalone plugin bundle (`dist/claude.js`, `dist/sidecar.mjs`)
- `pnpm dev:link:gemini`: link plugins and sidecars into `~/.gemini/config/` via junctions
- `pnpm dev:unlink:gemini`: remove links from `~/.gemini/config/`
- `pnpm dev:status`: view active links across Claude Code, Desktop, and Antigravity
- `pnpm lint`: run Biome linter
- `pnpm format`: format code with Biome

## Linking for Local Development

To link plugins and sidecars into your local Antigravity environment, run:
```bash
pnpm dev:link:gemini [mod...]
```

Or manually create directory junctions in PowerShell:
```powershell
# 1. Link the plugin (rules, skills, metadata)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\<mod>" -Target "d:\personal\claude-mods\plugins\<mod>"

# 2. Link the sidecar (Auxiliary Pane webview server)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\<mod>" -Target "d:\personal\claude-mods\plugins\<mod>\sidecars\<mod>"
```

## Best Practices for Antigravity Plugins

1. **Shared Pure Logic**: Always keep domain logic in `hooks/*.ts` with the `FsLike` abstraction. Do not duplicate logic in `server.mjs`.
2. **Zero Dependencies**: Keep sidecar servers pure Node.js (`node:http`, `node:fs`, `node:path`, `node:test`). Do not add runtime npm packages.
3. **Automated Testing**: Write comprehensive test coverage in `test/*.test.mjs` covering endpoints, token verification, and SSR rendering.
