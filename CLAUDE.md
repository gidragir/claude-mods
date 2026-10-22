@AGENTS.md

# CLAUDE.md

Guidelines and operational standards for Claude Code working in this repository.

## Overview

A satellite repository of dual-target cross-model plugins supporting both **Claude Code** (sandboxed TUI mods in TypeScript) and **Google Antigravity** (Auxiliary Pane webview sidecars), unified by the **Bifrost** (`@gidragir/bifrost`) framework.

- **Workspace Invariant**: Always author plugins in `plugins/<mod>/` within this repository. Never write to the single-session folder `~/.claude/dev-mods/`.
- **Single Source of Truth**: Each plugin defines its specification in `mod.config.ts` using `defineMod(...)`.

## Specialized Skills for Claude Code

Detailed procedural instructions are decomposed into specialized skills in `.agents/skills/`:

- [`.agents/skills/claude-code-mod/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/claude-code-mod/SKILL.md) — Claude Code adapter (`hooks/register.tsx`), TUI layout rules, and sandbox budget.
- [`.agents/skills/bifrost-framework/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/bifrost-framework/SKILL.md) — Framework APIs, `FsLike`, `HeadlessStore`, and server factories.
- [`.agents/skills/cross-mod-testing/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/cross-mod-testing/SKILL.md) — Hybrid test suite (`bun test` vs `pnpm test:claude`).
- [`.agents/skills/mod-scaffolding/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/mod-scaffolding/SKILL.md) — Scaffolding new plugins (`pnpm new`) and `mod.config.ts`.
- [`.agents/skills/plugin-distribution/SKILL.md`](file:///d:/personal/claude-mods/.agents/skills/plugin-distribution/SKILL.md) — Local linking (`dev:link`, `dev:link:desktop`) and `bifrost build`.

## Key Commands

| Command | Purpose |
| --- | --- |
| `bun test` | Ultra-fast unit testing of pure core logic & stores (~100ms) |
| `pnpm test:claude` | Run Claude Code engine integration tests (`claude plugin test`) |
| `pnpm test:sidecar` | Run Antigravity sidecar HTTP tests (`*.test.mjs`) |
| `pnpm test:all` | Run full test suite across Bun, Claude Code, and Antigravity |
| `pnpm check [mod]` | Run `claude plugin validate` + `tsc -p` + `claude plugin test` |
| `pnpm typecheck` | Run TypeScript type checks (`tsc -p`) |
| `bun x bifrost build <path>` | Compile standalone bundles (`dist/claude.js`, `dist/sidecar.mjs`) |
| `pnpm lint` | Run Biome lint checks |
| `pnpm format` | Format codebase with Biome |
| `pnpm dev:link` | Link mods into `mise.local.toml` for repo terminal sessions |
| `pnpm dev:link:desktop` | Link mods into `~/.claude/settings.json` for Claude Desktop |
| `pnpm dev:status` | Check active development links and junctions |

## Critical Runtime Invariants for Claude Code

### 1. Sandbox & Host Heartbeat Budget (~5000ms)
- **Strict Sandbox**: No Node.js or DOM globals. Everything external goes through `$` (`$.fs`, `$.process`, `$.ui`, `$.state`, `$.store`).
- **Single-Pass Resolution**: Extract, parse, and construct data items in a single pass over the filesystem. Never discover IDs first and probe the filesystem again in a second pass.
- **Bound Directory Traversals**: Never probe permutations of non-existent paths. Cap folder searches using `boundTraversalByRecency` (e.g. top 10 most recent folders sorted by `mtimeMs` descending).
- **Guard Host RPCs**: Wrap host IPC promises (`read($, atom)`, `$.ui.open()`, `learn()`, `$.state.set()`, `$.ui.selection()`) with `.catch()` to prevent unhandled host rejections from terminating the worker process.

### 2. TUI Layout & Element Constraints
- **`<Button>` Children**: A `<Button>` accepts **only string children or `<Text>` elements**. Never nest a `<Box>` inside a `<Button>`. Wrap card borders around the button externally.
- **Safe `<Input>` Resolution**: Check `'Input' in host.ui.resolve(e)` before rendering text inputs (not all surfaces support Input).
- **Adaptive Split View**: Branch on `bodyColumns >= 90`:
  - $\ge 90$: Split view with left card sidebar (`width={36}`) and right markdown detail pane.
  - $< 90$: Master-detail overview with drill-down view and `← Overview (b)` navigation.

### 3. Hook Contracts & Error Boundaries
- **Thin Hooks**: Keep `hooks/register.tsx` focused on lifecycle routing.
- **Guard Hooks with `.catch()`**: Equip guard hooks (`tool.call`, `prompt.submit`, `command.run`) with `.catch(($, e, next) => next.called ? next(e) : { deny: '...' })`.
- **Chain Preservation**: If your hook does not handle an event, it MUST call `next(e)` to preserve other plugins and engine functionality.
- **State Partitioning**: Use `$.state` for UI rendering state (survives hot reload); use `$.store` for persistent data across sessions.

## Permissions

Commands like `pnpm check`, `bun test`, `pnpm test:claude`, `pnpm test:sidecar`, `pnpm test:all`, `pnpm lint`, `pnpm format`, and `claude plugin validate|test` are pre-authorized in `.claude/settings.json`.
