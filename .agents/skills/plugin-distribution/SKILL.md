---
name: plugin-distribution
description: Load and distribute Bifrost plugins - dev links for terminal Claude, Claude Desktop and Antigravity, the release/<mod> branches built by CI, and the marketplace. Use when linking a plugin for live testing or changing how plugins are distributed; for cutting a release use the releasing skill.
---

# Distribution

Everything ships from `plugins/<mod>/dist/` (built by `bifrost build`): one folder that is a Claude Code
plugin (`.claude-plugin/`, `hooks/`, `types/`) and an Antigravity plugin (`plugin.json`, `skills/`,
`rules/`, `sidecars/<mod>/`) at once.

## Live development

| Command | Effect |
| --- | --- |
| `pnpm dev [mod…]` | rebuild `dist` on save |
| `pnpm dev:link [mod…]` | `CLAUDE_CODE_PLUGIN_DIRS` (+ `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`) in `mise.local.toml` for `claude` in this repo |
| `pnpm dev:link:desktop [mod…]` | the same in `~/.claude/settings.json` `env` (daily backup, atomic write) for Claude Desktop |
| `pnpm dev:link:agy [mod…]` | junctions in `~/.gemini/config/plugins` and `.../sidecars` |
| `pnpm dev:unlink*`, `pnpm dev:status` | remove links; show links, stale links and name clashes |

Links point at `dist` and are built first if missing. They only add: installed plugins, marketplaces and
foreign plugin dirs stay; a name an installed, enabled plugin uses is skipped (`--force` to link anyway).
`~/.claude/settings.json` and `~/.gemini/config` belong to the user: link there only on request.

## Releasing a plugin

Follow [`releasing`](../releasing/SKILL.md): bump, commit, `pnpm release:check`, push `main` alone, then the
tags, then verify `release/<mod>`. On a `<mod>-v<version>` tag `.github/workflows/release-plugins.yml` runs `bun test`, builds the plugin and force-pushes `dist`
   (without `tests/` and engine-laid types) to the orphan branch `release/<mod>` at its root, plus a
   tarball artifact.

Install: `/plugin marketplace add gidragir/claude-mods` + `/plugin install <mod>@claude-mods` (the
marketplace points at `release/<mod>`), or `agy plugin install gidragir/claude-mods#release/<mod>`.

## The framework

Plugins in this monorepo resolve `@gidragir/bifrost` to its sources. Publishing the framework
(`framework-v<version>`) is framework work: [packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md).
