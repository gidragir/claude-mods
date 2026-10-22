---
name: cross-mod
description: Develop, test, link, and maintain cross-model plugins supporting both Claude Code (TUI mods) and Google Antigravity (Auxiliary Pane sidecars). Master hub indexing specialized skills.
---

# Cross-Model Plugin Development Hub

This skill is the central hub for developing cross-model plugins that function seamlessly across both **Claude Code** and **Google Antigravity**, powered by the **Bifrost** (`@gidragir/bifrost`) framework.

## Specialized Skills Index

Documentation and operational guidance are decomposed into dedicated systematic skills. Activate the specialized skill matching your specific task:

| Skill | Description & Trigger Context | File |
|---|---|---|
| **`bifrost-framework`** | Core framework APIs: `FsLike`, `safeList`, `boundTraversalByRecency`, `HeadlessStore`, `defineClaudePlugin`, `createSidecarApp`, `renderMarkdown`. | [bifrost-framework](file:///d:/personal/claude-mods/.agents/skills/bifrost-framework/SKILL.md) |
| **`mod-scaffolding`** | Scaffolding new plugins via `pnpm new <mod>`, directory structure, and `mod.config.ts` configuration. | [mod-scaffolding](file:///d:/personal/claude-mods/.agents/skills/mod-scaffolding/SKILL.md) |
| **`claude-code-mod`** | Claude Code adapter (`hooks/register.tsx`), sandbox watchdog budget (~5000ms), pure functional TUI panes, `<Button>`/`<Input>` constraints, state. | [claude-code-mod](file:///d:/personal/claude-mods/.agents/skills/claude-code-mod/SKILL.md) |
| **`antigravity-sidecar`** | Auxiliary Pane HTTP microservice, `ANTIGRAVITY_SIDECAR_UI_TOKEN`, `/preload.js`, Pico CSS webviews, SSR markdown, chat injection. | [antigravity-sidecar](file:///d:/personal/claude-mods/.agents/skills/antigravity-sidecar/SKILL.md) |
| **`cross-mod-testing`** | Hybrid test runner (`bun test` ~100ms vs `pnpm test:claude`), engine parameter mocking, sidecar tests, Biome linting, type checking. | [cross-mod-testing](file:///d:/personal/claude-mods/.agents/skills/cross-mod-testing/SKILL.md) |
| **`plugin-distribution`** | Local development linking (`dev:link`, `dev:link:gemini`), standalone compiler `bifrost build`, GitHub Actions CI/CD release workflows. | [plugin-distribution](file:///d:/personal/claude-mods/.agents/skills/plugin-distribution/SKILL.md) |

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Shared Pure Core                                  │
│       (@gidragir/bifrost/core & plugins/<mod>/hooks/*.ts)              │
│    • Zero dependencies, pure domain logic                              │
│    • Abstract I/O via FsLike ({ list, read }), safe traversal helpers  │
│    • Reactive HeadlessStore state management                           │
│    • Unit tested with bun test in ~100ms                               │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │                                │
           (Sandbox runtime $)             (Node 24 type stripping)
                    │                                │
┌───────────────────┴────────────────┐ ┌─────────────┴───────────────────┐
│     Claude Code Adapter            │ │ Antigravity Adapter             │
│    (@gidragir/bifrost/server & ui) │ │ (@gidragir/bifrost/server & ui) │
│  • defineClaudePlugin wrapper      │ │  • createSidecarApp HTTP server │
│  • Pure functional TUI patterns    │ │  • Zero-dependency SSR markdown │
│  • Slash commands (/mod)           │ │  • Webview Aux Pane (Pico CSS)  │
│  • $.state / $.store integration   │ │  • Skills & rules               │
└────────────────────────────────────┘ └─────────────────────────────────┘
                                ▲
                                │
                    mod.config.ts (defineMod)
         Single source of truth for manifests & settings
```

---

## End-to-End Workflow

1. **Scaffold & Configure**: Run `pnpm new <name> "description"`, then configure `mod.config.ts` (see `mod-scaffolding`).
2. **Implement Pure Core**: Write logic in `hooks/core.ts` using `FsLike` and verify via `bun test` (see `bifrost-framework`).
3. **Implement Claude Code Adapter**: Wire hooks in `hooks/register.tsx` and design TUI in `hooks/ui.tsx` (see `claude-code-mod`).
4. **Implement Antigravity Adapter**: Build `server.mjs` using `createSidecarApp` and webview in `ui/index.html` (see `antigravity-sidecar`).
5. **Verify Full Quality Suite**: Run `bun test && pnpm test:claude && pnpm test:sidecar && pnpm lint` (see `cross-mod-testing`).
6. **Local Linking & Release**: Test live with `pnpm dev:link:gemini` / `pnpm dev:link`, and compile standalone bundles with `bun x bifrost build` (see `plugin-distribution`).
