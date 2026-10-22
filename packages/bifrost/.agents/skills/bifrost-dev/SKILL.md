---
name: bifrost-dev
description: Use when changing @gidragir/bifrost itself (packages/bifrost) - adding or renaming an export, Host member, primitive or component, changing codegen or the adapters, bumping its version or releasing it - and not when building a plugin under plugins/<mod>.
---

# Developing Bifrost

The framework is released on its own (`framework-v<version>`); plugins consume its public API. Read
[packages/bifrost/AGENTS.md](../../../AGENTS.md) first: boundary and compatibility rules live there.

## Change workflow

1. Decide the API in [README.md](../../../README.md) terms: what a plugin author writes, in both hosts.
2. Implement in `src/`: a Host member or primitive goes into `core/` (types), `claude/`, `agy/` **and**
   `testing/`; a component into `ui/components.tsx` built only from primitives; export from `src/index.ts`.
3. Tests in `packages/bifrost/test` with inline fixtures (`definePlugin({ name: 'demo', … })`):
   | Layer | File |
   | --- | --- |
   | atoms, render, hooks, definePlugin | `core.test.tsx` |
   | components in both renderings | `components.test.tsx`, `html.test.tsx` |
   | agy server routes, effects, token | `agy.test.tsx` |
   | codegen, manifests | `cli.test.ts` |
4. `bun test packages/bifrost`, `tsc -p packages/bifrost`, `pnpm lint`.
5. Regression: `pnpm check` (all plugins). Plugins are not edited. A red plugin means the change broke the
   contract: add a deprecated alias or a default, then rerun.
6. README (public API), `CHANGELOG.md` under `Unreleased`, version in `package.json` when releasing.

## Rename or move an API

```ts
export interface Host {
  readonly pane: { open(...): …; scrollTo(ref: string): Promise<void> }
  /** @deprecated since 0.3.0: use `host.pane.scrollTo`. Removed in a later minor. */
  scrollTo(ref: string): Promise<void>
}
// each adapter: scrollTo: ref => pane.scrollTo(ref)
```

CHANGELOG: `Added host.pane.scrollTo` + `Deprecated host.scrollTo → host.pane.scrollTo`. Migrating the
plugins is a later, separate plugin task (root AGENTS.md), one commit per plugin.

## Red flags

| Thought | Reality |
| --- | --- |
| "Only one plugin uses it, just update the call site" | External plugins use it too. Alias + changelog. |
| "I'll fix the plugin in the same commit" | Plugin files never ride in a framework change. |
| "I'll test it through ref-pane" | Inline fixture in `packages/bifrost/test`. |
| "This helper is only for quote-comments" | Then it belongs in that plugin, not here. |
| "Claude adapter now, agy later" | Same change for `claude/`, `agy/`, `testing/`, or degrade explicitly. |

## Release

`node packages/bifrost/build.mjs` writes a self-contained package to `packages/bifrost/dist` (ESM bundles,
`.d.ts`, its own `package.json`, a Node `bifrost` bin). Move `Unreleased` in `CHANGELOG.md` to the new
version, bump `package.json`, tag `framework-v<version>` (on request):
`.github/workflows/publish-framework.yml` tests, builds and publishes to the GitHub registry. Inside the
monorepo plugins resolve `@gidragir/bifrost` to `src`, so they see changes immediately; that is why the
regression run in step 5 matters.
