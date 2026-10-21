@AGENTS.md

# CLAUDE.md

Quickstart and guidelines for Claude Code working in this repository.

## Overview

This repository builds dual-target plugins supporting both **Claude Code** (function hook mods) and **Google Antigravity** (sidecars & skills).

Always write plugins to `plugins/<mod>/` within this repository (never to the single-session folder `~/.claude/dev-mods/`).

## Key Commands

- `pnpm check [mod]`: run `claude plugin validate` + `tsc -p` + `claude plugin test`
- `pnpm test`: run Claude Code engine tests (`*.test.ts`)
- `pnpm test:sidecar`: run Antigravity sidecar tests (`*.test.mjs`)
- `pnpm test:all`: run all tests across the repository
- `pnpm lint`: run Biome lint checks
- `pnpm format`: format codebase with Biome
- `pnpm dev:link`: link mods into `mise.local.toml` for repo terminal sessions
- `pnpm dev:link:desktop`: link mods into `~/.claude/settings.json` for Claude Desktop
- `pnpm dev:link:gemini`: link mods into `~/.gemini/config/` for Antigravity
- `pnpm dev:status`: check active links across Claude Code, Desktop, and Antigravity
- `pnpm types:sync`: sync Claude Code engine API declarations

## Mod Development Rules

1. **Shared Pure Logic**: Place pure functions in `hooks/*.ts` using runtime-neutral abstractions like `FsLike` (`{ list, read }`). Keep them testable without `$`.
2. **Thin Hooks**: Keep `hooks/register.tsx` minimal. Wrap hooks with `.catch(($, e, next) => next.called ? next(e) : { deny: '...' })`.
3. **Chain Preservation**: Always call `next(e)` if your hook does not handle an event. Never silence the hook chain.
4. **State Management**: Use `$.state` for UI rendering state (survives hot reload); use `$.store` for persistent data across sessions.
5. **No Direct Node/DOM**: Claude Code runs in a sandbox. All I/O must go through `$`.
6. **Cross-Model Parity**: If creating an interactive pane, also consider providing the Antigravity sidecar adapter (`sidecars/<mod>/`) with SSR markdown.

## Permissions

Commands like `pnpm check`, `pnpm test`, `pnpm test:sidecar`, `pnpm test:all`, `pnpm lint`, and `claude plugin validate|test` are pre-authorized in `.claude/settings.json`.
