@AGENTS.md

# CLAUDE.md

Operational notes for Claude Code in this repository. AGENTS.md (imported above) is the reference.

## Invariants

- Framework work (`packages/bifrost`) follows `packages/bifrost/AGENTS.md` and its skills; plugin work never
  edits `packages/bifrost`, framework work never edits `plugins/`.
- Author plugins in `plugins/<mod>/` of this repository, never in the session folder `~/.claude/dev-mods/`.
- A plugin is `src/plugin.tsx` (`definePlugin`) plus its own `src/*` files. Do not create `hooks/`,
  `.claude-plugin/`, `plugin.json` or `sidecars/` in a plugin's source: `bifrost build` generates them in `dist/`.
- Plugin code imports only `@gidragir/bifrost` and its own files; it gets a `Host`, never `$` or Node.
- State: `atom('key', initial)` at module level (or `useState` with a literal key).
- Interactive elements get stable `key`s.

## Loop

1. `pnpm dev <mod>` (rebuilds `dist` on save; linked sessions hot-reload).
2. `bun test` in the plugin folder: logic and UI through `@gidragir/bifrost/testing`.
3. `pnpm check <mod>`: build, `claude plugin validate`, `tsc`, engine tests (`test/engine/*.ts`).
4. `pnpm lint`.

## Skills

- [`.agents/skills/cross-mod/SKILL.md`](.agents/skills/cross-mod/SKILL.md): hub.
- [`.agents/skills/bifrost-framework/SKILL.md`](.agents/skills/bifrost-framework/SKILL.md): API.
- [`.agents/skills/claude-code-mod/SKILL.md`](.agents/skills/claude-code-mod/SKILL.md): engine rules for plugins, raw `src/claude.ts`.
- [`.agents/skills/agy-pane/SKILL.md`](.agents/skills/agy-pane/SKILL.md): a plugin's Antigravity pane.
- [`.agents/skills/cross-mod-testing/SKILL.md`](.agents/skills/cross-mod-testing/SKILL.md): tests.
- [`.agents/skills/mod-scaffolding/SKILL.md`](.agents/skills/mod-scaffolding/SKILL.md): `pnpm new`.
- [`.agents/skills/plugin-distribution/SKILL.md`](.agents/skills/plugin-distribution/SKILL.md): linking, distribution.
- [`.agents/skills/releasing/SKILL.md`](.agents/skills/releasing/SKILL.md): releases of plugins and the framework.
- Framework: [`packages/bifrost/AGENTS.md`](packages/bifrost/AGENTS.md) and `packages/bifrost/.agents/skills/`.

## Permissions

`pnpm check`, `pnpm build`, `bun test`, `pnpm test*`, `pnpm lint`, `pnpm format`, `pnpm dev:status` and
`claude plugin validate|test` are pre-authorized in `.claude/settings.json`. Linking into
`~/.claude/settings.json` or `~/.gemini/config` (`dev:link:desktop`, `dev:link:agy`) changes the user's
environment: only on request.
