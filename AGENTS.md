# AGENTS.md

Instructions for AI agents (Claude Code, Google Antigravity, Codex, Cursor, etc.) working in this repository.

## Purpose

A satellite repository of cross-model plugins supporting both **Claude Code** (function hook plugins in TypeScript) and **Google Antigravity** (webview sidecars in the Auxiliary Pane). It **complements** installed plugins and extensions rather than replacing them:
- **Claude Code**: plugins are attached as additional plugin folders (`CLAUDE_CODE_PLUGIN_DIRS`) alongside installed plugins (`enabledPlugins`, marketplaces, `~/.claude/skills`).
- **Google Antigravity**: plugins are discovered via `.agents/plugins.json` or linked via junctions into `~/.gemini/config/plugins/<name>` and `~/.gemini/config/sidecars/<id>`.

## Cross-Model Tripartite Architecture

Plugins in this repository follow a tripartite architecture to share core logic while adapting cleanly to each environment:

1. **Shared Pure Core (`hooks/*.ts`)**:
   - Pure domain logic with zero external dependencies, no DOM, and no direct runtime globals (`$` or `node:fs`).
   - Relies on abstractions like `FsLike` (`{ list, read }`) so the same algorithms operate in both environments.
   - Tested with unit tests in `hooks/*.test.ts`.
   - Node 24 natively imports TypeScript files (`hooks/*.ts`) with type stripping—no build or bundling needed.

2. **Claude Code Adapter (`hooks/register.tsx`, `hooks/ui.tsx`)**:
   - Implements the Claude Code plugin contract via `export const register: Register = (on, options) => { ... }`.
   - Integrates with the Claude Code sandbox `$`: `$.fs` maps to `FsLike`, `$.slashCommand.register` adds commands, and `$.ui.render` mounts interactive TUI panes into the terminal.
   - **TUI UI Architecture**: Avoids heavy terminal UI engines (Ratatui/re-implementations); uses pure functional patterns (`renderMasterDetail`, `renderEmptyState`, `truncate` in `hooks/ui.tsx`) composed on top of native Flexbox primitives (`Box`, `Text`, `Button`, `Input`).

3. **Google Antigravity Adapter (`sidecars/<mod>/`, `skills/`, `rules/`)**:
   - **Sidecar (`sidecars/<mod>/`)**: A lightweight background Node.js HTTP microservice configured by `sidecar.json`. Serves webview HTML into the Antigravity Auxiliary Pane (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`).
   - **Webview UI Styling**: Uses ultra-lightweight semantic `pico.antigravity.css` mapped directly to Antigravity IDE custom properties (`--background`, `--foreground`, `--accent-color`, `--border-color`). Employs clean semantic HTML (`<header>`, `<main>`, `<aside>`, `<article>`, `<table>`) with zero framework bloat.
   - **Shared Core Import**: `server.mjs` directly imports pure functions from `../../hooks/*.ts` using Node 24 native type stripping.
   - **Server-Side Rendering (SSR)**: Markdown is parsed into sanitized HTML on the server (`markdown.mjs`) with zero npm dependencies.
   - **Agent Skills (`skills/<mod>/SKILL.md`)**: Teaches the agent when and how to navigate or invoke the plugin, including sidecar links (`[Label](sidecar://<id>/)`).
   - **Agent Rules (`rules/AGENTS.md`)**: Defines domain standards and citation rules automatically injected into agent context.

## Stack and Environment

- **Node >= 24** and **pnpm >= 11** are pinned in `mise.toml`; local overrides go in `mise.local.toml` (in `.gitignore`, sample in `mise.local.toml.example`).
- **pnpm workspace**: `plugins/*`, shared tool versions via `catalog:` in `pnpm-workspace.yaml`. Install new dev dependencies at the root through the catalog, never in individual mods.
- **TypeScript 7**: type checking only (`tsc -p`), no build step. The Claude Code engine and Node 24 run `.ts/.tsx` directly.
- **Biome**: fast linter and formatter configured in `biome.json`.
- **Scripts**: plain Node.js in `scripts/*.mjs` with no third-party dependencies, fully cross-platform (primary development OS is Windows).

## Cross-Model Plugin Directory Layout

```
packages/ui/                   Shared UI library & assets (source of truth)
  tui/                         Pure functional TUI patterns (patterns.tsx)
  web/                         Semantic Pico CSS & webview client SDK
  server/                      Sidecar server factory & SSR markdown parser
plugins/<mod>/
  .claude-plugin/plugin.json   Claude Code manifest (name, version, description, author[, types])
  plugin.json                  Antigravity manifest (name, displayName, description, version, suggestedPrompts)
  hooks/hooks.json             { "modules": ["./register.tsx"] } — Claude Code entry
  hooks/register.tsx           export const register: Register = (on, options) => { ... }
  hooks/ui.tsx                 Vendored functional TUI patterns (synced via pnpm ui:sync)
  hooks/*.ts                   Shared pure core logic (FsLike abstraction, no $, no Node globals)
  hooks/*.test.ts              Unit tests: import { test, expect, mock } from 'claude-code/testing'
  sidecars/<mod>/
    sidecar.json               Antigravity sidecar manifest (command, args, ui_config, views)
    server.mjs                 Node HTTP server, imports ../../hooks/*.ts directly via type stripping
    vendor/                    Vendored sidecar-server.mjs & markdown.mjs (synced via pnpm ui:sync)
    ui/index.html              Auxiliary Pane webview interface (styled with Pico CSS)
    ui/vendor/                 Vendored pico.antigravity.css & client.js (synced via pnpm ui:sync)
    test/*.test.mjs            Node test runner tests: import { test } from 'node:test'
  skills/<mod>/
    SKILL.md                   Antigravity agent skill definition with YAML frontmatter
  rules/
    AGENTS.md                  Mod-specific domain rules & standards (e.g. citation tags)
  types/index.d.ts             Claude Code state contract (interface PluginState) — only if keeping state
  package.json                 scripts (check, test, test:sidecar, typecheck, validate), no dependencies
  tsconfig.json                extends ../../tsconfig.base.json + include ../../types/engine
  README.md                    Dual-target documentation, usage, and installation guide
```

Create a new mod via `pnpm new <mod> "description"` (template in `templates/mod`). The script refuses if the name is already taken by an installed plugin.

## Runtime Constraints

### 1. Claude Code Sandbox
- The module runs in a strict sandbox: **no Node, no DOM**; everything external goes through `$` (`$.fs`, `$.process`, `$.clock`, `$.store`, `$.ui`, ...).
- Import only files **inside the plugin folder**, using static `import`. Dynamic `import()` breaks module loading. npm packages are unavailable at runtime.
- Shared code between mods at runtime goes through the plugin contract (`dependencies` in `plugin.json` + noun in `engine.create`), not via relative imports from neighboring folders.
- JSX is compiled against the global `h`; elements come from `$.ui.resolve(e)`, not from globals.
- Ephemeral rendering state uses `$.state` (survives hot reload); persistent state uses `$.store`. Module-level variables reset on reload.
- Equip guard hooks (`tool.call`, `prompt.submit`, ...) with `.catch(($, e, next) => next.called ? next(e) : { deny: '...' })`.
- If a hook does not handle an event itself, it MUST call `next(e)` to preserve other plugins and default engine behavior.
- **Hooks Worker Watchdog & Sandbox IPC Budget**:
  - The worker sandbox is monitored by a ~5000ms host heartbeat watchdog. Avoid unbounded sequential IPC loops over `$.fs`.
  - **Single-Pass Resolution**: Do not discover IDs in one pass and re-scan the filesystem in a second pass. Extract and construct data objects in a single pass.
  - **Inspect Existing Paths Only**: Never probe combinatorial permutations of non-existent directories. Run a single `$.fs.list(dir)` and filter entries in-memory.
  - **Bound Traversals by Recency**: Always cap directory searches (e.g. top 10 most recent folders sorted by `mtimeMs` descending).
  - **Guard Host RPCs**: Wrap host IPC promises (`read($, atom)`, `$.ui.open()`, `learn()`, `$.state.set()`, `$.ui.selection()`) with `.catch()` to prevent unhandled host rejections from terminating the worker process.
- **Dynamic Configuration**:
  - Verify `row.value.trim() !== ''` when reading from `$.config.list()` to prevent default empty strings from shadowing fallback options or atoms.
  - Subscribe to `config.set` to keep session atoms synchronized without requiring a session restart.

### 2. Antigravity Sidecar Runtime
- **Process Management**: Runs as a background child process spawned by Antigravity according to `sidecars/<mod>/sidecar.json`.
- **Environment Variables**:
  - `ANTIGRAVITY_SIDECAR_WEB_PORT`: Port assigned by the harness for the HTTP server.
  - `ANTIGRAVITY_SIDECAR_UI_TOKEN`: Secret token for securing endpoints.
- **Authentication**: When `ANTIGRAVITY_SIDECAR_UI_TOKEN` is set, all routes (except `/preload.js`) must verify the `X-Sidecar-Token` header or `?token=` query parameter, returning HTTP 401 if invalid.
- **Preload Script (`/preload.js`)**:
  - Serves `sidecar_sdk/preload.js` if available in `~/.gemini/config/node_modules/` or `~/.gemini/antigravity/lib/node_modules/`.
  - Must fall back to a self-contained inline preload script exposing `window.sidecar` with:
    - `getWorkspaceUris()`: returns active workspace paths/URIs.
    - `onWorkspaceChange(listener)`: subscribes to workspace change events.
    - `fetch(url, opts)`: wrapper attaching the security token.
    - Message listener for `theme-change` (synchronizing CSS custom properties) and `workspace-change`.
- **Realpath & Junction Handling (Windows)**:
  - Antigravity links sidecars via NTFS directory junctions (e.g. `~/.gemini/config/sidecars/<id> -> <repo>/plugins/<mod>/sidecars/<id>`).
  - When detecting direct script execution (`checkIsMain`), standard `fs.realpathSync()` on Windows preserves the drive letter casing (`d:` vs `D:`). To match reliably across junctions, symlinks, and drive casing differences, compare paths with `realpathSync.native` and apply case-insensitive matching on Windows (`rArg.toLowerCase() === rThis.toLowerCase()`).
- **Workspace Path Normalization**:
  - Workspace paths received from `window.sidecar` may arrive as `file:///...` URIs, POSIX paths, or Windows paths with backslashes. Always normalize via `fileURLToPath()` and `resolve()`.
- **Zero-Dependency SSR**:
  - To prevent client bundle bloat and ensure fast webview rendering, transform markdown to sanitized HTML on the sidecar server using pure regex/string parsers (`markdown.mjs`).
- **Chat Context & Selection Injection**:
  - Webviews offering reference inspection should support quoting highlighted text into the active chat prompt.
  - Standard protocol: emit dual `window.parent.postMessage` events (`add-chat-context` and `insert-prompt`), attempt `window.sidecar.agent?.sendMessage(...)`, and fall back to clipboard writing (`navigator.clipboard.writeText`) with toast feedback.
  - Constrain floating action buttons within viewport boundaries (`Math.min(window.innerWidth - buttonWidth, ...)`).

### 3. Plugin Isolation & Vendoring Strategy
- **Self-Contained Distribution**: Plugins installed via Claude Code Marketplace or Antigravity Extensions/Plugins UI are extracted as isolated standalone directories.
- **No Parent Directory Traversal**: Installed plugins cannot access `../../packages/ui` or other monorepo siblings.
- **Vendoring via `pnpm ui:sync`**: Shared UI patterns, CSS styles, and sidecar server helpers live in `packages/ui` during authoring, and are synchronized into `plugins/<mod>/hooks/ui.tsx` and `plugins/<mod>/sidecars/<mod>/vendor/` before publishing or local installation.

## Artifact Reference Standards

When analyzing tasks, review findings, feedback items, or architectural decisions, reference sections using standard tags:
- `RV-<n>`: Code review findings (e.g. `RV-1`, `RV-2`)
- `FB-<n>`: User and system feedback
- `T-<n>`: Tasks and checklist action items
- `ADR-<n>`: Architectural decision records
- `DBG-<n>`: Debugging hypotheses and logs
- `AC-<n>`: Acceptance criteria
- `US-<n>`: User stories

In Antigravity conversations, surface interactive sidecar pills to open the Auxiliary Pane directly:
```markdown
[Open Refs Pane](sidecar://ref-pane/)
```

## Commands

| Command | Target | What it does |
| --- | --- | --- |
| `pnpm install` | All | Install dependencies across workspace |
| `pnpm new <mod> "description"` | All | Scaffold a new mod from template |
| `pnpm check [mod...]` | Claude Code | `claude plugin validate` + `tsc -p` + `claude plugin test` |
| `pnpm test` | Claude Code | Run Claude Code engine tests (`*.test.ts`) |
| `pnpm test:sidecar` | Antigravity | Run Node test runner suite for sidecars (`*.test.mjs`) |
| `pnpm test:all` | Both | Run both engine tests and sidecar tests |
| `pnpm typecheck` | Claude Code | Run TypeScript type checks (`tsc -p`) |
| `pnpm lint` | All | Run Biome lint checks |
| `pnpm format` | All | Format codebase with Biome |
| `pnpm watch [mod...]` | Claude Code | Watch mode: typecheck and test on file save |
| `pnpm dev:link` | Claude Code | Link mods into `mise.local.toml` for local terminal sessions |
| `pnpm dev:link:desktop` | Claude Code | Link mods into `~/.claude/settings.json` for Claude Desktop |
| `pnpm dev:link:gemini` | Antigravity | Link mods and sidecars into `~/.gemini/config/` via junctions |
| `pnpm dev:unlink` | Claude Code | Unlink mods from `mise.local.toml` |
| `pnpm dev:unlink:desktop` | Claude Code | Unlink mods from `~/.claude/settings.json` |
| `pnpm dev:unlink:gemini` | Antigravity | Unlink mods and sidecars from `~/.gemini/config/` |
| `pnpm dev:status` | Both | Show linked mods across Claude Code, Desktop, and Antigravity |
| `pnpm marketplace` | Claude Code | Rebuild `.claude-plugin/marketplace.json` |
| `pnpm ui:sync` | Both | Synchronize shared UI toolkit and sidecar server into templates and plugins |
| `pnpm types:sync` | Claude Code | Update local engine type declarations in `types/engine` |

### Antigravity Local Linking

To link mods into Antigravity for live development, use the automated command:
```bash
pnpm dev:link:gemini [mod...]
```
Or manually create directory junctions in PowerShell:
```powershell
# Link plugin metadata, rules, and skills
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\<mod>" -Target "<repo>\plugins\<mod>"

# Link sidecar webview server
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\<mod>" -Target "<repo>\plugins\<mod>\sidecars\<mod>"
```

## Development Workflow

1. **Implement Core Logic**: Write pure functions in `hooks/*.ts` using `FsLike` abstraction and cover with tests in `hooks/*.test.ts`.
2. **Implement Claude Code Adapter**: Wire hooks into `hooks/register.tsx`. Run `pnpm check <mod>` until all checks pass.
3. **Implement Antigravity Adapter**:
   - Create `sidecars/<mod>/sidecar.json`, `server.mjs`, `markdown.mjs`, and `ui/index.html`.
   - Write automated tests in `sidecars/<mod>/test/*.test.mjs` verifying HTTP endpoints, SSR rendering, and token validation.
   - Run `pnpm test:sidecar` until green.
4. **Define Skills & Rules**:
   - Provide `rules/AGENTS.md` for artifact citation rules.
   - Provide `skills/<mod>/SKILL.md` for agent invocation and sidecar pill navigation.
5. **Lint & Full Test**: Run `pnpm lint` and `pnpm test:all` with zero errors.
6. **Live Verification**:
   - Claude Code: `pnpm dev:link` or `pnpm dev:link:desktop` (saving hot-reloads after a turn).
   - Antigravity: Test webview in Auxiliary Pane via `[Pill](sidecar://<id>/)`.
7. **Release**: Bump `version` in `.claude-plugin/plugin.json` and `plugin.json`, run `pnpm marketplace`, commit, push, and create a GitHub release tag `vX.Y.Z`.

## Conventions

- Code, identifiers, comments, documentation, and user-facing messages are strictly in English.
- Formatting: Biome (single quotes, no semicolons, 140 char line width).
- Commits: Only when explicitly requested by the user.
- The repository is public: tests, comments, and READMEs use neutral mock data (`TICKET-123`, `my-repo`), never proprietary or sensitive internal paths.
