---
name: antigravity-sidecar
description: Implement, style, and test Google Antigravity Auxiliary Pane sidecars and webviews. Use when authoring sidecars/<mod>/server.mjs, building webview UI (Pico CSS), handling ANTIGRAVITY_SIDECAR_UI_TOKEN, preload scripts, chat injection, or Windows NTFS junctions.
---

# Antigravity Sidecar & Webview Guide

This skill guides you through implementing and styling background HTTP sidecars that render interactive webviews in the **Google Antigravity Auxiliary Pane** (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`).

## 1. Architecture & Execution Model

Antigravity spawns the sidecar as a background child process defined in `sidecars/<mod>/sidecar.json`:

```json
{
  "command": "node",
  "args": ["server.mjs"],
  "restart_policy": "always",
  "display_name": "My Sidecar",
  "description": "Auxiliary Pane webview for My Mod",
  "has_web_ui": true,
  "ui_config": {
    "views": [
      {
        "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE",
        "path": "/",
        "title": "My View"
      }
    ]
  }
}
```

---

## 2. Server Implementation (`server.mjs`)

Use `createSidecarApp` from `@gidragir/bifrost/server` to get automatic token verification, `/preload.js` serving, and asset routing:

```javascript
import { checkIsMain, createSidecarApp } from '@gidragir/bifrost/server'
import { renderMarkdown } from '@gidragir/bifrost/ui'
import { resolveItems } from '../../hooks/core.ts'

export function createServer(opts = {}) {
  const app = createSidecarApp({
    name: 'my-mod-sidecar',
    ...opts,
  })

  // Protected API endpoint: requires valid ANTIGRAVITY_SIDECAR_UI_TOKEN if set
  app.get('/api/items', async (req, res) => {
    const workspaceUris = req.query.workspaces ? req.query.workspaces.split(',') : []
    const items = await resolveItems(workspaceUris)

    // Pre-render markdown server-side for zero-flicker UI updates
    const rendered = items.map(item => ({
      ...item,
      html: renderMarkdown(item.markdown),
    }))

    app.sendJson(res, 200, { items: rendered })
  })

  return app
}

if (checkIsMain(import.meta.url, process.argv[1])) {
  const app = createServer()
  app.listen(Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0)
}
```

---

## 3. Environment & Security

1. **`ANTIGRAVITY_SIDECAR_WEB_PORT`**: Port assigned by Antigravity (falls back to `0` for dynamic port allocation).
2. **`ANTIGRAVITY_SIDECAR_UI_TOKEN`**: When present in the environment:
   - All routes except `/preload.js` must validate the `X-Sidecar-Token` header or `?token=` query parameter.
   - Missing or invalid tokens return HTTP 401 Unauthorized.
   - `createSidecarApp` handles this automatically.

---

## 4. Preload Script & `window.sidecar` Contract

The sidecar serves `/preload.js` to initialize the client environment:
- `window.sidecar.getWorkspaceUris()`: Returns active workspace folder paths.
- `window.sidecar.onWorkspaceChange(listener)`: Subscribes to folder switches or additions.
- `window.sidecar.fetch(url, opts)`: Wraps `fetch` to attach authentication tokens automatically.
- Listens to `theme-change` events to synchronize IDE custom properties (`--background`, `--foreground`, etc.).

---

## 5. Webview UI & Styling (`ui/index.html`)

1. **Semantic Pico Antigravity CSS (`pico.antigravity.css`)**:
   - Zero-bloat semantic CSS mapped directly to Antigravity IDE custom properties (`--background`, `--foreground`, `--accent-color`, `--border-color`).
   - Use clean semantic HTML (`<header>`, `<main>`, `<aside>`, `<article>`, `<table>`).

2. **Chat Context & Prompt Injection**:
   - Webviews inspecting references should support quoting text directly into the agent chat:
   ```javascript
   function sendToChat(text) {
     // Standard postMessage protocol for Antigravity host
     window.parent.postMessage({ type: 'add-chat-context', text }, '*')
     window.parent.postMessage({ type: 'insert-prompt', text }, '*')
     
     // Fallback to clipboard
     if (navigator.clipboard) {
       navigator.clipboard.writeText(text)
     }
   }
   ```
   - Constrain floating action buttons within viewport bounds (`Math.min(window.innerWidth - buttonWidth, ...)`).

---

## 6. Windows NTFS Junction & Realpath Handling

Antigravity links sidecars via directory junctions (e.g., `~/.gemini/config/sidecars/<id>`).
- On Windows, `fs.realpathSync()` can preserve inconsistent drive casing (`d:` vs `D:`).
- Use `checkIsMain` from `@gidragir/bifrost/server` which uses `realpathSync.native` and case-insensitive matching on Windows.
- Always normalize workspace paths using `fileURLToPath()` and `resolve()`.

---

## 7. Interactive Navigation Pills

Guide users to open the sidecar view directly in chat messages:

```markdown
[Open My Sidecar](sidecar://<sidecar-id>/)
```
