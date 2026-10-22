---
name: bifrost-framework
description: Architecture, core abstractions, and runtime APIs of the @gidragir/bifrost cross-harness framework. Use when building against Bifrost, implementing pure core domain logic, working with FsLike, HeadlessStore, defineMod, or understanding framework packages.
---

# Bifrost Framework Guide (`@gidragir/bifrost`)

Bifrost is a unified, high-performance, cross-harness framework designed for developing plugins that run in both **Claude Code** (sandboxed terminal UI) and **Google Antigravity** (Auxiliary Pane webview sidecars).

## Package Architecture

```
packages/bifrost/
  src/
    core/      Pure domain logic, FsLike, HeadlessStore, defineMod
    server/    defineClaudePlugin, createSidecarApp, preload, checkIsMain
    ui/        Functional TUI patterns, SSR markdown parser, webview SDK
    cli/       bifrost build standalone bundler (esbuild) & manifest sync
```

---

## 1. Core Abstractions (`@gidragir/bifrost/core`)

The core module contains zero runtime dependencies, no DOM access, and no direct Node.js or engine sandbox globals (`$`).

### `FsLike` & Safe Traversal Helpers

Abstract filesystem operations to allow the same logic to execute inside the Claude Code sandbox (`$.fs`) or in standard Node.js (`node:fs`):

```typescript
import { type FsLike, safeList, safeRead, boundTraversalByRecency } from '@gidragir/bifrost/core'

export async function loadRecentDocuments(fs: FsLike, rootDir: string) {
  // safeList catches errors and returns an empty array on failure
  const entries = await safeList(fs, rootDir)

  // Bound scanning to the 10 most recently modified files
  const recentFiles = boundTraversalByRecency(
    entries.filter(e => e.kind === 'file'),
    10
  )

  const contents = await Promise.all(
    recentFiles.map(async file => ({
      name: file.name,
      content: await safeRead(fs, `${rootDir}/${file.name}`),
    }))
  )

  return contents
}
```

### `HeadlessStore`

Decoupled, reactive state store with subscription listeners:

```typescript
import { HeadlessStore } from '@gidragir/bifrost/core'

interface ModState {
  items: string[]
  selectedId: string | null
}

export const store = new HeadlessStore<ModState>({
  items: [],
  selectedId: null,
})

// Subscribe to state changes
const unsubscribe = store.subscribe(state => {
  console.log('State updated:', state)
})

// Mutate state immutably
store.setState(prev => ({ ...prev, selectedId: 'item-1' }))
```

### `defineMod`

Defines the specification and metadata for a plugin as the single source of truth:

```typescript
import { defineMod } from '@gidragir/bifrost/core'

export default defineMod({
  name: 'my-plugin',
  displayName: 'My Plugin',
  version: '0.1.0',
  description: 'Dual-target plugin description',
  commands: [
    { name: 'mycmd', description: 'Run custom command' }
  ],
  sidecar: {
    enabled: true,
    title: 'My View',
    entrypoint: 'SIDECAR_UI_ENTRYPOINT_AUX_PANE'
  },
  configSchema: {
    apiKey: { type: 'string', title: 'API Key', default: '' }
  }
})
```

---

## 2. Server Runtime Adapters (`@gidragir/bifrost/server`)

### Claude Code Plugin Adapter (`defineClaudePlugin`)

Wraps Claude Code registration with error boundaries, state bridging, and clean lifecycle hooks:

```typescript
import { defineClaudePlugin } from '@gidragir/bifrost/server'

export const register = defineClaudePlugin((on, { host, fs, getState, setState }) => {
  on('prompt.submit', async (event, next) => {
    // Inspected prompt
    return next(event)
  })
})
```

### Antigravity Sidecar Factory (`createSidecarApp`)

Creates a lightweight, secure HTTP microservice for the Auxiliary Pane:

```javascript
import { createSidecarApp, checkIsMain } from '@gidragir/bifrost/server'

export function createServer(opts = {}) {
  const app = createSidecarApp({
    name: 'my-plugin-sidecar',
    ...opts,
  })

  // Protected route (automatically verifies ANTIGRAVITY_SIDECAR_UI_TOKEN)
  app.get('/api/items', async (req, res) => {
    app.sendJson(res, 200, { items: [] })
  })

  return app
}

if (checkIsMain(import.meta.url, process.argv[1])) {
  const app = createServer()
  app.listen(Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0)
}
```

---

## 3. UI Patterns & Webview SDK (`@gidragir/bifrost/ui`)

### Functional TUI Patterns

Provides pure helper functions for rendering Master-Detail views, cards, empty states, and truncation in Claude Code:

```typescript
import { renderMasterDetail, Card, renderEmptyState, truncate } from '@gidragir/bifrost/ui'
```

### Server-Side Rendered (SSR) Markdown

Parses markdown into sanitized HTML on the sidecar server with zero runtime dependencies and badge highlighting:

```javascript
import { renderMarkdown } from '@gidragir/bifrost/ui'

const html = renderMarkdown('## Section\nReference: `RV-1`, `FB-2`')
```

### Webview Client SDK

Client helpers for `ui/index.html` communicating with Antigravity:

```javascript
import { initSidecarClient, quoteToChat } from '@gidragir/bifrost/ui'

const client = initSidecarClient({
  onWorkspaceChange: (uris) => refreshData(uris),
})
```

---

## 4. Standalone Compiler (`bifrost build`)

The Bifrost CLI builds standalone distribution bundles without external monorepo dependencies:

```bash
bun x bifrost build plugins/<mod-name>
```

- Produces `dist/claude.js` (< 50KB standalone bundle).
- Produces `dist/sidecar.mjs` (< 50KB standalone HTTP server).
- Produces `dist/index.html` with bundled styles.
- Merges configurations non-destructively into `plugin.json` and `.claude-plugin/plugin.json`.
