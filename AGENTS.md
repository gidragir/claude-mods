# AGENTS.md

Instructions for AI agents (Claude Code, Google Antigravity, Codex, Cursor, …) working in this repository.

## Purpose

Plugins for **Claude Code** and **Google Antigravity (agy)**, each written once with the **Bifrost**
framework (`packages/bifrost`, `@gidragir/bifrost`). A plugin is one `definePlugin({...})` in
`src/plugin.tsx`: state, commands, events and a React-like UI. `bifrost build` turns it into
`plugins/<mod>/dist/`, a complete plugin for both hosts. The repo **complements** installed plugins:
dev links only add plugin folders, never edit or disable others.

Naming: **agy** means Google Antigravity everywhere we own the name (`/agy` adapter, `dev:link:agy`,
`createAgyApp`). Antigravity's own contract keeps its names: `sidecar.json`, `sidecars/<id>/`,
`window.sidecar`, `ANTIGRAVITY_SIDECAR_*`, `sidecar://<id>/` pills.

## Framework and plugins are separate jobs

`packages/bifrost` is a product with its own instructions, skills, version and changelog. To change the
framework, work by [packages/bifrost/AGENTS.md](packages/bifrost/AGENTS.md) and its
`packages/bifrost/.agents/skills/`; this file and `.agents/skills/` cover plugin work only.

- A plugin task edits `plugins/<mod>/` only and uses Bifrost's public API ([README](packages/bifrost/README.md)).
  Missing component or helper: write it in the plugin. Missing Host capability: stop and report a
  framework request to the user.
- A framework task edits `packages/bifrost/` only and keeps the API backward compatible; plugins migrate
  later, in their own tasks.
- One task, one side, one commit scope (`feat(bifrost): …` vs `feat(<mod>): …`).

## Skills index

Detailed guidance lives in `.agents/skills/`, read on demand:

- [`cross-mod`](.agents/skills/cross-mod/SKILL.md): hub and end-to-end workflow.
- [`bifrost-framework`](.agents/skills/bifrost-framework/SKILL.md): `definePlugin`, state, host, components, CLI.
- [`mod-scaffolding`](.agents/skills/mod-scaffolding/SKILL.md): `pnpm new`, plugin layout.
- [`claude-code-mod`](.agents/skills/claude-code-mod/SKILL.md): the Claude Code engine's rules as they affect plugin code.
- [`agy-pane`](.agents/skills/agy-pane/SKILL.md): a plugin's Antigravity pane: config, effects, linking, debugging.
- [`cross-mod-testing`](.agents/skills/cross-mod-testing/SKILL.md): plugin Bun tests, the test kit, engine tests.
- [`plugin-distribution`](.agents/skills/plugin-distribution/SKILL.md): dev linking, plugin release branches.

## Architecture

```
packages/bifrost/  the framework: own AGENTS.md, skills, version, CHANGELOG (not covered here)
plugins/<mod>/
  src/plugin.tsx   definePlugin (required)        src/*.ts(x)       logic, components
  src/claude.ts    optional raw engine hooks module, bundled beside the generated one
  test/*.test.ts(x) Bun                           test/engine/*.ts  engine tests → dist/tests
  skills/ rules/ docs/ README.md                  copied into dist
  dist/            generated, gitignored: .claude-plugin/, hooks/, types/, plugin.json, sidecars/<mod>/, tests/
templates/mod/     scaffold for `pnpm new`
scripts/*.mjs      plain Node, no deps, cross-platform (primary OS: Windows)
```

Flow: components return a neutral tree of eight primitives (`Box`, `Text`, `Button`, `Input`, `Select`,
`Markdown`, `Code`, `Link`). The Claude adapter maps it onto `$.ui.resolve(e)`; the agy adapter renders
HTML on the server and the page posts events back by element `key`. Handlers, commands and events
receive a `Host` (never `$` or Node), so plugin code is identical in both hosts.

## Runtime rules

### Plugin code (`src/`)

- Import only `@gidragir/bifrost` and the plugin's own files. No Node, no DOM, no `claude-code` imports:
  the same code runs in the engine worker and in the agy server. Files go through `host.fs`.
- Declare state with `atom('key', initial)` at module level; `useState('key', …)` keys must be string
  literals. The build turns every key into a literal engine atom; an unknown key still works but resets on
  reload (and logs a warning).
- State values are plain data. Hooks are keyed by atom, so they may sit in conditions and loops.
- Give `Button`, `Input`, `Select` a stable `key`: engine tests, the test kit and the agy page address
  elements by it.
- Host calls never throw (they resolve to `undefined`/`false`/`''`); handler errors are caught and
  logged. Do not add `.catch` around host calls in plugin code.
- Claude-only behaviour goes in `claude: { promptSubmit, turnComplete, sessionStart, configChange }`.
  Anything the framework does not cover goes in `src/claude.ts` (raw `register`, engine rules apply).
- Keep work per event bounded (the engine has a ~5000 ms heartbeat): single pass over files, cap
  traversals with `boundTraversalByRecency`, never probe permutations of paths that may not exist.

### What the framework guarantees (do not re-implement in plugins)

The generated hooks module satisfies the Claude Code engine's scanner (literal `on` names and atoms,
`$` call sites, the state `types` contract, guard `.catch`, `next(e)` chaining); the generated agy server
keeps Antigravity's contract (loopback, port, UI token, preload, effects). Details and changes to either:
[packages/bifrost/AGENTS.md](packages/bifrost/AGENTS.md).

## Stack

- Node ≥ 24, pnpm ≥ 11, Bun ≥ 1.2 pinned in `mise.toml`; overrides in `mise.local.toml` (gitignored).
- pnpm workspace (`packages/*`, `plugins/*`), shared versions via `catalog:` in `pnpm-workspace.yaml`.
  Install dev dependencies at the root through the catalog, never in individual plugins.
- TypeScript 7 for type checks; Bun runs tests and the CLI (`packages/bifrost/src/cli/bin.ts`).
- Plugin `tsconfig.json` covers `src` with no ambient types; `test/tsconfig.json` adds Bun's.
- Biome for lint and format (`biome.json`).
- `types/engine/` holds the engine's declarations (generated by `pnpm types:sync`, not committed).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install the workspace |
| `pnpm new <mod> "description"` | Scaffold `plugins/<mod>` from `templates/mod` and build it |
| `pnpm build [mod…]` | `bifrost build`: `plugins/<mod>/dist` for both hosts |
| `pnpm dev [mod…]` | Build and rebuild on save |
| `bun test` | All framework and plugin tests (~100 ms) |
| `pnpm check [mod…]` | Per plugin: build, `claude plugin validate dist`, `tsc` (src + tests), `claude plugin test dist` |
| `pnpm test:engine [mod…]` | Build + engine tests only |
| `pnpm typecheck` | `tsc` for plugins and the framework |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm dev:link` / `dev:link:desktop` / `dev:link:agy` | Load `dist` into terminal `claude` / Claude Desktop / Antigravity |
| `pnpm dev:unlink` / `dev:unlink:desktop` / `dev:unlink:agy` | Remove those links |
| `pnpm dev:status` | Links, stale links, name clashes |
| `pnpm marketplace` | Build, then regenerate `.claude-plugin/marketplace.json` and `.agents/plugins.json` |
| `pnpm types:sync` | Refresh `types/engine` from the newest engine-laid declarations |

## Development workflow

1. Logic in `src/*.ts` (pure, `FsLike` for files) with Bun tests in `test/*.test.ts`.
2. State, panes, commands and events in `src/plugin.tsx`; UI from `@gidragir/bifrost` components.
3. Fast loop: `pnpm dev <mod>` + `bun test` in the plugin folder (`mount`, `runCommand` from the test kit).
4. Engine check: scenarios in `test/engine/*.ts`, then `pnpm check <mod>` until green.
5. Agent docs: `skills/<mod>/SKILL.md` (with a `[Label](sidecar://<mod>/)` pill) and `rules/AGENTS.md`.
6. `pnpm lint` and `bun test` with zero errors.
7. Live: `pnpm dev:link:desktop` / `pnpm dev:link:agy` with `pnpm dev` running.
8. Release: bump `version` in `definePlugin`, `pnpm marketplace`, commit, tag `<mod>-v<version>` (CI builds
   `release/<mod>` from `dist`).

## Pitfalls

- Never write generated files into a plugin's source folder; everything generated goes to `dist/`.
- Release branches hold the built plugin at the repository root; nesting breaks
  `claude plugin install <repo>#release/<mod>`.
- `bun test` from a plugin folder needs the plugin's `bunfig.toml` (it ignores `dist/**`, where the
  engine tests are copied).
- Dev links pointing at a plugin's source folder (from before the move to `dist`) are stale:
  `pnpm dev:status` flags them; link again.

## Artifact reference standards

When analyzing tasks, review findings, feedback or decisions, reference sections with standard tags:
`RV-<n>` review findings, `FB-<n>` feedback, `T-<n>` tasks, `ADR-<n>` decisions, `DBG-<n>` debugging
hypotheses, `AC-<n>` acceptance criteria, `US-<n>` user stories.

In Antigravity conversations, surface a pill that opens the pane: `[Open Refs Pane](sidecar://ref-pane/)`.

## Conventions

- Code, identifiers, comments, documentation and user-facing messages are in English.
- Formatting: Biome (single quotes, no semicolons, 140-character lines).
- Commits only when explicitly requested by the user.
- The repository is public: tests, comments and READMEs use neutral mock data (`TICKET-123`, `my-repo`).
