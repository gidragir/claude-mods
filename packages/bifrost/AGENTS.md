# AGENTS.md — @gidragir/bifrost

Instructions for AI agents changing the **framework** in `packages/bifrost`. Writing or changing a plugin
under `plugins/<mod>` is a different job: follow the repository root [AGENTS.md](../../AGENTS.md) instead.

## Boundary

The framework is a product with its own version, changelog and npm release. Plugins in this repository are
its consumers, exactly like plugins in other repositories. The contract between them is the **public API**:
the package exports (`package.json` `exports`) and what [README.md](README.md) documents.

- A framework task changes files under `packages/bifrost/` only. It never edits `plugins/`, `templates/`
  or plugin docs to make a framework change land.
- Framework code never names a plugin, never carries plugin-specific behaviour, and is tested with its own
  fixtures in `packages/bifrost/test` (inline `definePlugin({ name: 'demo', … })`), never by importing a
  plugin.
- Plugins are a regression signal, not a test fixture: `pnpm check` over all plugins after a change must
  stay green **without touching them**. If a plugin breaks, the change is not backward compatible: fix the
  framework (see Compatibility), do not "fix" the plugin.
- How many plugins use an API today is not an argument. External plugins use it too.
- Plugin migration to a new API is a separate plugin task, done later, under the root AGENTS.md.

## Compatibility

- Additive changes (new export, new optional prop, new Host member): `CHANGELOG.md` entry, minor bump.
- Renames, moves, removals and behaviour changes: keep the old API working as a deprecated alias
  (`/** @deprecated use host.pane.scrollTo */`) for at least one minor release, log both in `CHANGELOG.md`
  (`Deprecated` + migration line). Remove only in a later release, after plugins have migrated.
- Generated output (`dist/` layout, manifests, the hooks module, the agy server routes) is part of the
  contract: changing it is a breaking change too.
- Version lives in `packages/bifrost/package.json`, bumped at release (changes collect under
  `Unreleased`). Any API addition, deprecation, removal or generated-output change = minor; fixes with no
  API change = patch.

## Layout

```
src/
  core/        atom + MemoryStore, Host interface, render loop + hooks, VNode primitives, definePlugin, FsLike
  ui/          components (Card, Row, Column, Header, Toolbar, EmptyState, Field, SearchInput, MasterDetail)
  claude/      install(on, options, plugin), claudeHost($), VNode → engine elements
  agy/         createAgyApp/runAgy: node:http server, VNode → HTML, client.js runtime, bifrost.css, markdown SSR
  testing/     createTestHost, mount, runCommand, submitPrompt, completeTurn, memoryFs
  cli/         bifrost build|dev: evaluate plugin → codegen → esbuild → dist
  index.ts  jsx-runtime.ts  jsx-dev-runtime.ts
test/          Bun tests per layer (core, components, html, agy, cli)
build.mjs      publishable package → dist/
README.md      public API reference (the contract)
CHANGELOG.md   per release: Added / Changed / Deprecated / Removed / Fixed
```

Every capability has three implementations that must agree: `claude/`, `agy/` and `testing/`. A new Host
member or primitive lands in all three in the same change, degrading (no-op, `undefined`) where a harness
lacks it. Host calls never throw.

## Skills

- [`bifrost-dev`](.agents/skills/bifrost-dev/SKILL.md): change workflow, tests, versioning, release.
- [`bifrost-claude-adapter`](.agents/skills/bifrost-claude-adapter/SKILL.md): engine scanner rules and how
  `claude/` + codegen satisfy them.
- [`bifrost-agy-adapter`](.agents/skills/bifrost-agy-adapter/SKILL.md): the Antigravity server, page
  runtime, effects, styling.

## Commands

| Command | What it does |
| --- | --- |
| `bun test packages/bifrost` | Framework tests only |
| `tsc -p packages/bifrost` | Framework typecheck |
| `pnpm check` | All plugins against the changed framework (regression signal, read-only for plugins) |
| `node packages/bifrost/build.mjs` | Publishable package in `packages/bifrost/dist` |
| `pnpm lint` | Biome |

## Conventions

Same as the root: English, Biome style, commits only on request, neutral mock data. Framework commits use
the `bifrost` scope (`feat(bifrost): …`, `refactor(bifrost)!: …`) and never include plugin files.
