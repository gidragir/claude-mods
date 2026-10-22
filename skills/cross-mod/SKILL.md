---
name: cross-mod
description: Develop, test, link, and maintain cross-model plugins supporting both Claude Code (TUI mods) and Google Antigravity (Auxiliary Pane sidecars).
---

# Cross-Model Plugin Development Guide

This skill guides agents and developers through building, testing, linking, and maintaining cross-model plugins that function seamlessly across both **Claude Code** and **Google Antigravity**.

## Architecture Overview

Cross-model plugins follow a tripartite architecture to maximize code reuse while respecting the security and runtime constraints of both platforms:

```
┌────────────────────────────────────────────────────────┐
│           Shared Pure Core (hooks/*.ts)                │
│    • Zero dependencies, pure domain logic               │
│    • Abstract I/O via FsLike ({ list, read })           │
│    • Unit tested with claude-code/testing               │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       (Sandbox runtime $)      (Node 24 type stripping)
                │                        │
┌───────────────┴───────────────┐ ┌──────┴───────────────┐
│     Claude Code Adapter       │ │ Antigravity Adapter  │
│     (hooks/register.tsx)      │ │   (sidecars/<mod>/)  │
│  • Function hooks             │ │  • HTTP microservice │
│  • Interactive TUI panes      │ │  • SSR HTML markdown │
│  • Slash commands (/mod)      │ │  • Webview Aux Pane  │
│  • $.state / $.store          │ │  • Skills & rules    │
└───────────────────────────────┘ └──────────────────────┘
```

---

## Step-by-Step Development Workflow

### UI Architecture Strategy

1. **Claude Code TUI**:
   - Clean, functional UI patterns (`renderMasterDetail`, `renderEmptyState`, `truncate` in `hooks/ui.tsx`).
   - Composed directly over native Flexbox primitives (`Box`, `Text`, `Button`, `Input`).
   - Avoids heavyweight UI engines or complex state machines.

2. **Antigravity Webview (Auxiliary Pane)**:
   - Ultra-lightweight semantic Pico Antigravity CSS (`pico.antigravity.css`).
   - Built directly on IDE CSS custom properties (`--background`, `--foreground`, `--accent-color`, `--border-color`).
   - Clean semantic HTML (`<header>`, `<main>`, `<aside>`, `<article>`, `<table>`) without framework bloat.

3. **Self-Contained Vendoring**:
   - Marketplace and UI installs run in standalone folders without access to repo root.
   - All shared UI and server helpers are authored in `packages/ui` and vendored into plugin directories via `pnpm ui:sync`.

---

### Step 1: Scaffold the Mod

1. Run the scaffolding script from the workspace root:
   ```bash
   pnpm new <mod-name> "Short description of what the mod does"
   ```
2. The template generates a complete dual-target project structure automatically:
   - `.claude-plugin/plugin.json` & `plugin.json`: Claude Code and Antigravity manifests.
   - `hooks/register.tsx` & `hooks/ui.tsx`: Interactive TUI master-detail pane.
   - `sidecars/<mod-name>/`: Complete sidecar with server, vendored Pico CSS, and webview UI.
   - `skills/<mod-name>/SKILL.md`: Pre-configured agent skill.
   - `rules/AGENTS.md`: Citation rules.
3. If shared UI components in `packages/ui` were modified, run:
   ```bash
   pnpm ui:sync
   ```

---

### Step 2: Implement the Shared Pure Core (`hooks/*.ts`)

Domain logic must not reference `$` (Claude Code sandbox) or `node:fs` directly. Define an abstraction interface:

```typescript
// hooks/core.ts
export type FsLike = {
  list: (path?: string) => Promise<{ name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }[]>
  read: (path: string) => Promise<string>
}

export async function processArtifacts(fs: FsLike, rootDir: string): Promise<Result[]> {
  // Pure business logic here
}
```

Write unit tests in `hooks/core.test.ts` using mock file systems:

```typescript
// hooks/core.test.ts
import { expect, test } from 'claude-code/testing'
import { processArtifacts, type FsLike } from './core.ts'

test('processArtifacts parses valid entries', async () => {
  const mockFs: FsLike = {
    list: async () => [{ name: 'doc.md', kind: 'file', mtimeMs: 1000 }],
    read: async () => '# Sample Title\nContent',
  }
  const result = await processArtifacts(mockFs, '/mock')
  expect(result.length).toBe(1)
})
```

---

### Step 3: Implement the Claude Code Adapter (`hooks/register.tsx`)

Wire the shared core into Claude Code lifecycle hooks:

1. Map `$.fs` into `FsLike`:
   ```typescript
   const fsLike: FsLike = {
     list: async path => (await $.fs.list(path)).map(e => ({ name: e.name, kind: e.isDirectory ? 'dir' : 'file', mtimeMs: e.mtimeMs })),
     read: async path => $.fs.read(path),
   }
   ```
2. Register commands, guards, and UI panes:
   ```typescript
   export const register: Register = (on, options) => {
     on('prompt.submit', async (e, next) => {
       // Inspect or mutate prompt
       return next(e)
     }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Execution failed' }))

     $.slashCommand.register({
       name: 'mymod',
       description: 'Run mymod command',
       handler: async () => {
         // Perform action
       },
     })
   }
   ```

3. **TUI Layout Standards & Element Constraints**:
   - **`<Button>` constraints**: accepts only string children or `<Text>` elements. Never place a `<Box>` inside a `<Button>` (the engine refuses it). Wrap cards as:
     ```tsx
     <Box borderStyle="round" borderColor={isSel ? 'cyan' : undefined} borderDimColor={!isSel} paddingX={1} flexDirection="column">
       <Button variant={isSel ? 'primary' : 'secondary'} onPress={() => ...}>{id}</Button>
     </Box>
     ```
   - **Safe `<Input>` resolution**: `$.ui.resolve(e)` returns the union of element tables across all surfaces. Mobile lacks `Input`. Safely extract with:
     ```typescript
     const Input = 'Input' in els ? els.Input : undefined
     ```
   - **Adaptive Split View**: branch on `e.props.bodyColumns >= 90`:
     - **Split View ($\ge 90$)**: Left card sidebar (`width={36}`), right markdown detail pane (`flexGrow={1}`).
     - **Master-Detail ($< 90$)**: Overview card list, drill-down detail view with `← Overview (b)`.
   - **Hotkeys**: single lowercase letters (`p` — prev, `n` — next, `b` — overview, `c` — clear filter).

4. **Hooks Worker Watchdog & IPC Guardrails**:
   - **Watchdog Budget (~5000ms)**: Hooks running in the Claude Code sandbox are terminated if they stall the host heartbeat. Avoid combinatorial or unbounded sequential `$.fs` IPC round-trips.
   - **Single-Pass Resolution**: Parse and resolve data items in one pass rather than discovering IDs first and re-reading disk files in a second pass.
   - **Bound Directory Traversals**: Never probe permutations of non-existent paths. Query actual directories once via `$.fs.list` and cap scans (e.g. top 10 most recent folders sorted by `mtimeMs` descending).
   - **Guard Host RPCs**: Wrap host IPC promises (`read($, atom)`, `$.ui.open()`, `learn()`, `$.state.set()`, `$.ui.selection()`) with `.catch()` to prevent unhandled host rejections from killing the worker process.
   - **Dynamic Configuration Sync**: Check `row.value.trim() !== ''` when parsing `$.config.list()` to prevent default empty strings from shadowing fallback options. Listen to `config.set` to keep session atoms synchronized without requiring a restart.

---

### Step 4: Implement the Antigravity Sidecar (`sidecars/<mod>/`)

1. **Sidecar Manifest (`sidecar.json`)**:
   ```json
   {
     "command": "node",
     "args": ["server.mjs"],
     "restart_policy": "always",
     "display_name": "My Plugin Pane",
     "description": "Auxiliary Pane webview for My Plugin",
     "has_web_ui": true,
     "ui_config": {
       "views": [
         {
           "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE",
           "path": "/",
           "title": "My Plugin"
         }
       ]
     }
   }
   ```

2. **Sidecar Server (`server.mjs`)**:
   - Use the vendored server factory:
     ```javascript
     import { checkIsMain, createSidecarServer } from './vendor/sidecar-server.mjs'

     export const { server, start } = createSidecarServer({
       uiHtml: HTML_CONTENT,
       staticFiles: {
         '/pico.css': { contentType: 'text/css; charset=utf-8', content: PICO_CSS },
         '/client.js': { contentType: 'application/javascript; charset=utf-8', content: CLIENT_JS },
       },
       routes: {
         '/api/data': (req, res) => { /* custom API */ },
       },
     })

     if (checkIsMain(import.meta.url, process.argv[1])) {
       start().then(({ port }) => console.log(`Listening on ${port}`))
     }
     ```
   - Pre-render markdown to HTML via SSR (`markdown.mjs`) for instant zero-dependency UI updates.

3. **Webview UI (`ui/index.html`)**:
   - Link `/pico.css` for instant theme-matched styling with zero configuration.
   - Use clean semantic markup (`<div class="split-view">`, `<aside>`, `<section class="content-pane">`, `<article class="card">`).
   - Use `/client.js` helper `initSidecarClient({ onWorkspaceChange })` for workspace sync.
   - **Selection to Chat Context**: Support text selection forwarding by emitting dual `window.parent.postMessage` events (`add-chat-context`, `insert-prompt`), optional `window.sidecar.agent?.sendMessage(...)`, and fallback clipboard copying (`navigator.clipboard.writeText`) with toast feedback.
   - Constrain floating action buttons within viewport boundaries (`Math.min(window.innerWidth - buttonWidth, ...)`).

4. **Automated Sidecar Tests (`test/sidecar.test.mjs`)**:
   - Use `node:test` and `node:assert/strict` to verify server endpoints, token authentication, and SSR output.

---

### Step 5: Add Agent Skills and Rules

1. **Skill Definition (`skills/<mod>/SKILL.md`)**:
   - Include YAML frontmatter with `name` and `description`.
   - Provide instructions for navigating the plugin and embedding sidecar link pills:
     ```markdown
     [Open Plugin Pane](sidecar://<mod>/)
     ```

2. **Domain Rules (`rules/AGENTS.md`)**:
   - Define artifact standards or tagging conventions (e.g. `RV-1`, `FB-2`, `T-3`, `ADR-4`).

---

### Step 6: Testing & Quality Verification

#### 1. Engine Testing Standards (`claude-code/testing`)
- **Hook Mock Result Contract**: Hooks intercepting operations on `$` (`fs.list`, `fs.read`, `session.cwd`) MUST return an object wrapping `value`:
  ```typescript
  on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => ({
    value: [{ name: 'doc.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }]
  }))
  ```
  *(Returning raw arrays or objects without `{ value }` causes the engine to skip the hook).*
- **`FsEntry` Shape**: Always specify `isLink: boolean` (`false`) to satisfy strict TypeScript checking (`TS2741`).
- **Responsive UI Mount**: Verify both Split and Compact modes via `$.ui.mount` with varying `bodyColumns`:
  ```typescript
  // Split view test
  const splitUi = await $.ui.mount({ ...PANE, props: { ...defaultProps, bodyColumns: 100 } })
  // Compact view test
  const compactUi = await $.ui.mount({ ...PANE, props: { ...defaultProps, bodyColumns: 80 } })
  ```

#### 2. Verification Suite Commands
Run the full verification suite before committing:

```bash
# 1. Claude Code mod validation, type checking, and tests
pnpm check <mod-name>

# 2. Antigravity sidecar HTTP endpoints and SSR tests
pnpm test:sidecar

# 3. Comprehensive test suite
pnpm test:all

# 4. Biome linting & formatting checks
pnpm lint
```

---

### Step 7: Local Development Linking

#### Claude Code Linking
- **Terminal session (mise)**: `pnpm dev:link <mod-name>`
- **Claude Desktop**: `pnpm dev:link:desktop <mod-name>` (writes to `~/.claude/settings.json`, then restart Claude Desktop from system tray).
- **Inspect status**: `pnpm dev:status`
- **Marketplace Clash Resolution**: If the plugin is already installed from marketplace cache (`~/.claude/plugins/cache/`), temporarily disable it so the local link takes precedence:
  ```bash
  claude plugin disable <mod-name>
  ```
- **Global Terminal Testing**: `mise.local.toml` applies only inside the repository. To run `claude` with your local mod from any directory on Windows, set user environment variables:
  ```powershell
  [System.Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', 'D:\personal\claude-mods\plugins\<mod>', 'User')
  [System.Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIR_WATCH', '1', 'User')
  ```

#### Antigravity Linking
Use the automated linking command:
```bash
pnpm dev:link:gemini <mod-name>
```

Or create NTFS directory junctions manually in PowerShell:
```powershell
# Plugin discovery (rules, skills, metadata)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\<mod-name>" -Target "d:\personal\claude-mods\plugins\<mod-name>"

# Sidecar discovery (Auxiliary Pane service)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\<mod-name>" -Target "d:\personal\claude-mods\plugins\<mod-name>\sidecars\<mod-name>"
```

---

### Step 8: Publishing & Releasing

1. Ensure tests and linter are clean: `pnpm test:all && pnpm lint`.
2. Bump `version` in `.claude-plugin/plugin.json` and `plugin.json`.
3. Update marketplace index: `pnpm marketplace`.
4. Commit, push to git, tag `vX.Y.Z`, and create a GitHub release.
