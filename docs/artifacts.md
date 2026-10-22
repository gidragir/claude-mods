# Project Artifacts & Review Log

## RV-1 Code Review: Contract Alignment in Sidecar Server
- **Status**: Resolved
- **File**: `plugins/ref-pane/sidecars/ref-pane/server.mjs`
- **Description**: Ensure `nodeFs.list` returns `{ name, kind: 'dir' | 'file' | 'other', mtimeMs }` exactly matching `FsLike` interface.

```javascript
// Verified implementation in server.mjs
const nodeFs = {
  async list(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return Promise.all(entries.map(async e => ({
      name: e.name,
      kind: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
      mtimeMs: (await fs.stat(join(dir, e.name)).catch(() => ({ mtimeMs: 0 }))).mtimeMs,
    })))
  }
}
```

## FB-1 User Feedback: Dual Target Plugin Support
- **Status**: Implemented
- **Description**: Enable the same plugin bundle to run both inside Claude Code terminal and Antigravity Auxiliary Pane.

> [!NOTE]
> The shared pure TypeScript core in `hooks/*.ts` is consumed directly by both Claude Code and Antigravity with zero bundling or build steps.

## T-1 Task: Auxiliary Pane Visual Validation
- **Status**: In Progress
- **Priority**: High
- **Description**: Open the sidecar webview in the Antigravity Auxiliary Pane and verify CSS theme variable propagation and SSR markdown rendering.

| Item | Expected | Actual | Status |
| --- | --- | --- | --- |
| Headings | Formatted `h3`/`h4` | Styled with theme font | Pass |
| Code Blocks | Dark background with border | Monospace font & padding | Pass |
| Tables | Collapsed borders with header | Clean theme styling | Pass |
| Badges | Highlighted pill badges | Distinct accent color | Pass |

## ADR-1 Architecture: Headless Shared Core Pattern
- **Decision**: Keep domain logic in pure TypeScript (`hooks/*.ts`) with zero runtime host dependencies (`$`, `DOM`, `Node globals`).
- **Consequences**:
  1. Both Claude Code (via engine sandbox) and Antigravity (via Node 24 ESM type stripping) consume the exact same source code.
  2. Test suites run natively under `claude plugin test` and Node 24 `node --test`.

## AC-1 Acceptance Criteria: Local Loopback Security
- **Requirement**: Sidecar HTTP server must strictly bind to `127.0.0.1` and enforce `X-Sidecar-Token` authentication for all non-public endpoints.
- **Verification**: Verified with automated test suite in `plugins/ref-pane/sidecars/ref-pane/test/server.test.mjs`.
