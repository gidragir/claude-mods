@AGENTS.md

## Claude Code

- To create and debug mods, use the `plugin-authoring` skill, but write mods to `plugins/<mod>/` in this repository, not to the session folder `~/.claude/dev-mods/` (a mod there is visible to a single session only).
- `pnpm check`, `pnpm test`, `claude plugin validate|test` are allowed in `.claude/settings.json` without confirmation.
