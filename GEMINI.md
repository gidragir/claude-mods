@AGENTS.md

# GEMINI.md

Developer and agent guide for Google Antigravity and Gemini CLI working in this repository.

## Overview

This repository is a dual-target project supporting both **Google Antigravity** (sidecars, skills, and rules) and **Claude Code** (function hook mods).

Antigravity interacts with plugins via:
- **Plugin Discovery**: `.agents/plugins.json` lists plugin directories (`"path": "plugins"`).
- **Plugin Manifest**: `plugins/<mod>/plugin.json` specifies metadata, display names, and suggested prompts.
- **Rules**: `plugins/<mod>/rules/AGENTS.md` automatically injects domain rules (e.g. artifact reference standards `RV-1`, `FB-2`, `T-3`, `ADR-4`) into agent sessions.
- **Skills**: `plugins/<mod>/skills/<name>/SKILL.md` (and root `skills/`) teaches agents when and how to invoke features.
- **Sidecars**: `plugins/<mod>/sidecars/<mod>/` runs background HTTP services rendering webviews in the Electron Auxiliary Pane.

## Antigravity Sidecar Architecture

Sidecars provide rich, interactive graphical interfaces within the Antigravity Auxiliary Pane:

### 1. Sidecar Manifest (`sidecar.json`)
Located at `plugins/<mod>/sidecars/<mod>/sidecar.json`:
```json
{
  "command": "node",
  "args": ["server.mjs"],
  "restart_policy": "always",
  "display_name": "Refs Pane",
  "description": "Webview auxiliary pane for browsing referenced ticket and review artifacts",
  "has_web_ui": true,
  "ui_config": {
    "views": [
      {
        "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE",
        "path": "/",
        "title": "Refs"
      }
    ]
  }
}
```

### 2. Node.js 24 Native Type Stripping
`server.mjs` imports the shared pure TypeScript core directly from `../../hooks/*.ts`:
```javascript
import { findIds, HOME, resolveRefs, rootsIn } from '../../hooks/refs.ts'
```
No compilation, build, or bundling step is required.

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

- `pnpm test:sidecar`: run Node test runner tests for sidecars (`plugins/*/sidecars/*/test/*.test.mjs`)
- `pnpm test:all`: run both Claude Code engine tests and Antigravity sidecar tests
- `pnpm test`: run Claude Code engine tests
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
