# Changelog

All notable changes to `@gidragir/bifrost`. Sections per release: Added, Changed, Deprecated, Removed,
Fixed. A deprecation names its replacement and the migration in one line.

## Unreleased

## 0.2.0

- `definePlugin` architecture: one `src/plugin.tsx` per plugin, `bifrost build` generates both hosts.

### Fixed

- `bifrost build` / `dev` no longer fails with `EBUSY` while Antigravity runs the plugin's pane: the agy
  server's folder (its working directory, which Windows will not delete) is emptied and kept.
- agy: dim text, blockquotes and meta lines were invisible. Antigravity sets its theme variables
  (`--muted`, `--accent`, `--border`…) inline on the root, overriding ours; `bifrost.css` now declares
  only `--bf-*` and reads `--muted-foreground`, `--border`, `--accent` from the host.
- `node build.mjs` emits declarations without the engine's types (absent in CI): a stand-in in
  `build/claude-code.d.ts`; the published `.d.ts` are unchanged.
- `MasterDetail`: the narrow drill-down shows a button per item again; meta text stays on one line.
