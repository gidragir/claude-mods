# __MOD_NAME__

__MOD_DESCRIPTION__

One plugin for **Claude Code** (a pane in the terminal or desktop app) and **Google Antigravity** (the same pane in the
aux-pane webview), built with [Bifrost](../../packages/bifrost/README.md).

## Usage

- `/__MOD_NAME__ <text>` adds a note and opens the pane.
- In the pane: pick a note, `a` adds it to the chat prompt, `p` / `n` walk the list.

## Install

Claude Code:

```text
/plugin marketplace add gidragir/claude-mods
/plugin install __MOD_NAME__@claude-mods
```

Antigravity: `agy plugin install gidragir/claude-mods#release/__MOD_NAME__`.

## Develop

```bash
pnpm dev __MOD_NAME__      # build and rebuild on save; linked sessions hot-reload
bun test                   # from this folder: logic and UI tests in milliseconds
pnpm check __MOD_NAME__    # build + claude plugin validate + tsc + engine tests
```
