# @gidragir/bifrost

Cross-harness plugin framework for **Claude Code** and **Google Antigravity**.

## Architecture

- `@gidragir/bifrost/core`: Pure domain logic with `FsLike` abstraction, `HeadlessStore`, and `defineMod`. Zero external dependencies.
- `@gidragir/bifrost/server`: Sidecar server factory (`createSidecarApp`), token authentication, and Claude Code plugin registration adapter (`defineClaudePlugin`).
- `@gidragir/bifrost/ui`: Functional TUI primitives (`renderMasterDetail`, `renderSplitView`, `renderEmptyState`), zero-dependency SSR markdown renderer, and Pico CSS webview assets.
- `@gidragir/bifrost/cli`: CLI compiler (`bifrost build`) bundling standalone Claude plugins and Antigravity sidecars with esbuild.
