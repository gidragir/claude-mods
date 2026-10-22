---
name: cross-mod-testing
description: Comprehensive testing, validation, and linting across Bun, Claude Code, and Antigravity. Use when running tests, writing unit/sidecar tests, debugging test runner errors, or validating manifests.
---

# Cross-Model Testing & Quality Verification Guide

This skill details the hybrid testing strategy for cross-model plugins, covering lightning-fast local testing via **Bun**, host engine integration tests via **Claude Code**, and HTTP sidecar tests via **Node.js**.

## 1. Hybrid Testing Strategy

The repository uses a hybrid test setup to balance speed and fidelity:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. bun test                                                 │
│    • Pure core logic (hooks/*.ts)                           │
│    • HeadlessStore & FsLike state                           │
│    • SSR Markdown parsing & CLI helpers                     │
│    • Runs in ~100ms across monorepo                         │
├─────────────────────────────────────────────────────────────┤
│ 2. pnpm test:claude (claude plugin test)                    │
│    • Claude Code sandbox integration (hooks/register.test.ts)│
│    • Engine hooks ($), slash commands, TUI mounting         │
├─────────────────────────────────────────────────────────────┤
│ 3. pnpm test:sidecar (node --test)                          │
│    • Sidecar HTTP servers & routing                         │
│    • Preload script & token authentication                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Test Commands Summary

| Command | Runner | Purpose |
|---|---|---|
| `bun test` | Bun | Ultra-fast unit and pure core logic tests (~100ms) |
| `pnpm test:claude` | Claude CLI | Claude Code engine host tests (`claude plugin test`) |
| `pnpm test:sidecar` | Node | Sidecar server HTTP & security endpoint tests |
| `pnpm test:all` | All | Runs `bun test && pnpm test:claude && pnpm test:sidecar` |
| `pnpm typecheck` | TypeScript | Strict type checking (`tsc -p`) across plugins |
| `bun run build` | TypeScript | Verifies framework `.d.ts` declaration emit |
| `pnpm validate` | Claude CLI | Validates `.claude-plugin/plugin.json` and hooks |
| `pnpm lint` | Biome | Lints and formats all files across the monorepo |

---

## 3. The Testing Bridge (`packages/claude-code/testing.js`)

Claude Code tests use:
```typescript
import { test, expect, on, $ } from 'claude-code/testing'
```

### Critical Runner Invariant
- Tests that inspect or accept engine parameters (e.g. `test('...', ($, { ... }) => { ... })` where `fn.length > 0`) **cannot run in standard Node or Bun without the host engine**.
- Running them directly causes: `TypeError: undefined is not an object (evaluating '$.command.run')`.
- The testing bridge in `packages/claude-code/testing.js` automatically skips these tests under `bun test` (`fn.length > 0 -> test.skip`), leaving pure unit tests to execute instantly in Bun, and delegating host tests to `pnpm test:claude`.

---

## 4. Claude Code Engine Mock Contracts

When mocking engine operations inside `claude plugin test`:

1. **Wrapped Value Contract**:
   Hooks intercepting operations on `$` (`fs.list`, `fs.read`, `session.cwd`) **must return an object wrapping `value`**:
   ```typescript
   on('fs.list', async (_$, e): Promise<{ value: FsEntry[] }> => ({
     value: [{ name: 'doc.md', kind: 'file', size: 100, mtimeMs: 1000, isLink: false }]
   }))
   ```
   *Returning raw arrays or objects without `{ value }` causes the engine to skip the mock.*

2. **`FsEntry` Requirements**:
   Always include `isLink: boolean` (`false`) to satisfy strict TypeScript checking (`TS2741`).

3. **Responsive UI Mount**:
   Verify both Split and Compact modes via `$.ui.mount` with varying `bodyColumns`:
   ```typescript
   // Split view (>= 90 columns)
   const splitUi = await $.ui.mount({ ...PANE, props: { ...defaultProps, bodyColumns: 100 } })

   // Compact view (< 90 columns)
   const compactUi = await $.ui.mount({ ...PANE, props: { ...defaultProps, bodyColumns: 80 } })
   ```

---

## 5. Automated Sidecar Testing (`test/*.test.mjs`)

Sidecar tests use `node:test` and `node:assert/strict`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from '../server.mjs'

test('sidecar server enforces token authentication', async () => {
  const app = createServer({ token: 'secret-token' })
  const port = await app.listen(0)

  // 1. Missing token -> 401
  const resUnauth = await fetch(`http://127.0.0.1:${port}/api/items`)
  assert.equal(resUnauth.status, 401)

  // 2. Valid token -> 200
  const resAuth = await fetch(`http://127.0.0.1:${port}/api/items`, {
    headers: { 'X-Sidecar-Token': 'secret-token' }
  })
  assert.equal(resAuth.status, 200)

  await app.close()
})
```
