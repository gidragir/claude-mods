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

### Step 1: Scaffold the Mod

1. Run the scaffolding script from the workspace root:
   ```bash
   pnpm new <mod-name> "Short description of what the mod does"
   ```
2. Verify created structure in `plugins/<mod-name>/`:
   - `.claude-plugin/plugin.json`: Claude Code manifest.
   - `plugin.json`: Antigravity manifest at plugin root.
   - `hooks/`: TypeScript hooks and logic.
   - `package.json`: Mod workspace configuration.

3. Add sidecar, skills, and rules folders:
   ```bash
   mkdir -p plugins/<mod-name>/sidecars/<mod-name>/ui
   mkdir -p plugins/<mod-name>/sidecars/<mod-name>/test
   mkdir -p plugins/<mod-name>/skills/<mod-name>
   mkdir -p plugins/<mod-name>/rules
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
   - Node 24 natively imports TypeScript: `import { processArtifacts } from '../../hooks/core.ts'`.
   - Implement `createSidecarHandler({ token })`:
     - Serve `/preload.js` with fallback `window.sidecar` implementation.
     - Validate `token` from `process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN` via `X-Sidecar-Token` or `?token=` on all other endpoints.
     - Handle realpath and junction checks across Windows drive casing differences:
       ```javascript
       function checkIsMain() {
         if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) return true
         if (!process.argv[1]) return false
         const thisFile = fileURLToPath(import.meta.url)
         const argFile = resolve(process.argv[1])
         if (argFile === resolve(thisFile)) return true
         if (process.platform === 'win32' && argFile.toLowerCase() === resolve(thisFile).toLowerCase()) return true
         try {
           if (existsSync(argFile) && existsSync(thisFile)) {
             const realThis = realpathSync.native ? realpathSync.native(thisFile) : realpathSync(thisFile)
             const realArg = realpathSync.native ? realpathSync.native(argFile) : realpathSync(argFile)
             if (realArg === realThis) return true
             if (process.platform === 'win32' && realArg.toLowerCase() === realThis.toLowerCase()) return true
           }
         } catch {}
         return false
       }
       ```
     - Pre-render markdown to HTML via SSR (`markdown.mjs`, reusable from `plugins/ref-pane/sidecars/ref-pane/markdown.mjs`) to deliver instant zero-dependency UI updates.

3. **Webview UI (`ui/index.html`)**:
   - Access `window.sidecar.fetch()` to communicate with server endpoints.
   - Listen to `workspace-change` via `window.sidecar.onWorkspaceChange()`.
   - Use CSS custom properties passed through `theme-change` events for seamless IDE theme matching.

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
- **Claude Desktop**: `pnpm dev:link:desktop <mod-name>`
- **Inspect status**: `pnpm dev:status`

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
