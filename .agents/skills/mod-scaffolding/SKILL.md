---
name: mod-scaffolding
description: Scaffold and configure new cross-model plugins using Bifrost and mod.config.ts. Use when creating a new plugin, initializing directory structure, defining manifests, or configuring plugin settings and schemas.
---

# Plugin Scaffolding & Configuration Guide

This skill guides you through scaffolding a new dual-target plugin (supporting both **Claude Code** and **Google Antigravity**) and configuring its metadata using Bifrost.

## 1. Quick Scaffolding

From the workspace root, run:

```bash
pnpm new <mod-name> "Short description of what the mod does"
```

The scaffolding script validates that the mod name does not collide with existing marketplace or installed plugins and generates the canonical layout:

```
plugins/<mod-name>/
├── mod.config.ts                # Canonical Bifrost configuration (single source of truth)
├── .claude-plugin/plugin.json   # Synchronized Claude Code manifest
├── plugin.json                  # Synchronized Antigravity manifest
├── hooks/
│   ├── hooks.json               # Claude Code entry module pointer
│   ├── register.tsx             # Claude Code plugin entry (defineClaudePlugin)
│   ├── ui.tsx                   # Functional TUI patterns
│   ├── core.ts                  # Pure domain logic (FsLike abstraction)
│   ├── core.test.ts             # Unit tests (bun test)
│   └── register.test.ts         # Engine integration tests
├── sidecars/<mod-name>/
│   ├── sidecar.json             # Antigravity sidecar configuration
│   ├── server.mjs               # Node HTTP server (createSidecarApp)
│   ├── ui/
│   │   ├── index.html           # Auxiliary Pane webview interface
│   │   └── vendor/              # pico.antigravity.css & client.js
│   └── test/
│       └── server.test.mjs      # Node test runner suite
├── skills/<mod-name>/
│   └── SKILL.md                 # Antigravity agent skill definition
├── rules/
│   └── AGENTS.md                # Agent domain rules & standards
├── package.json                 # Scripts (check, test, test:sidecar, typecheck, validate)
├── tsconfig.json                # Extends tsconfig.base.json
└── README.md                    # Dual-target documentation
```

---

## 2. Configuring `mod.config.ts`

`mod.config.ts` is the single source of truth for both platforms. It is compiled non-destructively into `.claude-plugin/plugin.json`, `plugin.json`, and `sidecar.json`:

```typescript
import { defineMod } from '@gidragir/bifrost/core'

export default defineMod({
  name: 'my-plugin',
  displayName: 'My Plugin',
  version: '0.1.0',
  description: 'Clean description of what the plugin does',
  author: 'Your Name',
  license: 'MIT',
  
  // Claude Code slash commands
  commands: [
    {
      name: 'mycmd',
      description: 'Run mycmd in terminal',
    },
  ],

  // Antigravity Sidecar settings
  sidecar: {
    enabled: true,
    title: 'My Plugin View',
    entrypoint: 'SIDECAR_UI_ENTRYPOINT_AUX_PANE',
  },

  // Starter prompts shown in UI cards
  suggestedPrompts: [
    'Inspect recent project artifacts',
    'Generate a summary report',
    'Open the sidecar view'
  ],

  // Dynamic user settings schema (mapped to Claude Code userConfig)
  configSchema: {
    targetPrefix: {
      type: 'string',
      title: 'Target Prefix',
      description: 'Prefix filter for artifact lookup',
      default: 'TICKET-',
    },
  },
})
```

---

## 3. Synchronizing Manifests & Web Assets

Whenever you update `mod.config.ts` or modify shared web assets in `packages/bifrost`:

1. **Synchronize web assets**:
   ```bash
   pnpm ui:sync
   ```
   Vendors `client.js` and `pico.antigravity.css` into `sidecars/<mod>/ui/vendor/` and formats with Biome.

2. **Re-generate manifests**:
   ```bash
   bun x bifrost build plugins/<mod-name>
   ```
   Updates manifests without overwriting custom properties.

---

## 4. Checklist for a New Plugin

1. [ ] Run `pnpm new <name> "description"`.
2. [ ] Fill out `mod.config.ts` with commands, sidecar settings, and config schema.
3. [ ] Verify unit test passes: `bun test plugins/<name>`.
4. [ ] Verify sidecar test passes: `pnpm test:sidecar`.
5. [ ] Verify typecheck passes: `pnpm typecheck`.
6. [ ] Link for local development: `pnpm dev:link:gemini <name>` and `pnpm dev:link <name>`.
