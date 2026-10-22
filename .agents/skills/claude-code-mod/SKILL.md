---
name: claude-code-mod
description: Develop, debug, and optimize Claude Code plugin adapters and TUI panes. Use when implementing hooks/register.tsx, designing terminal master-detail interfaces, handling Claude Code sandbox constraints, IPC budgets, or state management.
---

# Claude Code Plugin Adapter Guide

This skill guides you through implementing the Claude Code adapter (`hooks/register.tsx`), styling interactive terminal UI (TUI) panes, managing state, and adhering to engine sandbox constraints.

## 1. Adapter Implementation (`hooks/register.tsx`)

Use `defineClaudePlugin` from `@gidragir/bifrost/server` to wrap the plugin lifecycle:

```tsx
import { defineClaudePlugin } from '@gidragir/bifrost/server'
import { processItems } from './core.ts'
import { Pane } from './ui.tsx'

export const register = defineClaudePlugin((on, { host, fs, getState, setState }) => {
  // 1. Session start
  on('session.start', async (event, next) => {
    return next(event)
  })

  // 2. Prompt guard with error boundary
  on('prompt.submit', async (event, next) => {
    // Inspect or enrich user prompt text
    return next(event)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Execution failed' }))

  // 3. Register Slash Command
  host.slashCommand.register({
    name: 'mymod',
    description: 'Open interactive TUI pane',
    handler: async (args) => {
      await host.ui.open('mymod-pane')
    },
  })

  // 4. Mount TUI Pane
  on('ui.render', async (event, next) => {
    if (event.requestId === 'mymod-pane') {
      return next({
        ...event,
        element: <Pane host={host} fs={fs} />,
      })
    }
    return next(event)
  })
})
```

---

## 2. Sandbox Constraints & Watchdog Budget

The Claude Code worker sandbox is monitored by a **~5000ms host heartbeat watchdog**. Exceeding this budget or throwing unhandled errors terminates the plugin process.

### Critical Rules
1. **Single-Pass Resolution**: Extract, parse, and construct data items in a single pass over the filesystem. Never discover IDs in pass 1 and re-read the disk in pass 2.
2. **Inspect Existing Paths Only**: Never probe permutations of non-existent paths. Query actual directories once via `$.fs.list` and filter entries in-memory.
3. **Bound Directory Traversals**: Always cap directory searches using `boundTraversalByRecency` (e.g., top 10 or 30 most recent files sorted by `mtimeMs` descending).
4. **Guard Host RPCs**: Wrap host IPC calls (`$.fs.read()`, `$.ui.open()`, `$.state.set()`, `$.ui.selection()`) with `.catch()` to prevent host rejections from crashing the worker.
5. **Dynamic Config Verification**: Check `row.value.trim() !== ''` when reading `$.config.list()` to prevent default empty strings from shadowing fallbacks.

---

## 3. TUI Layout & Element Constraints

Claude Code TUI panes render using native Flexbox primitives (`Box`, `Text`, `Button`, `Input`):

### `<Button>` Child Invariant
- **Strict Rule**: A `<Button>` accepts **only string children or `<Text>` elements**.
- **Never nest `<Box>` inside `<Button>`**: The engine parser will throw a layout exception.
- Wrap cards externally:
  ```tsx
  <Box borderStyle="round" borderColor={isSelected ? 'cyan' : undefined} paddingX={1} flexDirection="column">
    <Button variant={isSelected ? 'primary' : 'secondary'} onPress={() => handleSelect(id)}>
      <Text bold={isSelected}>{id}</Text>
    </Button>
  </Box>
  ```

### Safe `<Input>` Resolution
- Not all Claude Code runtime surfaces support `Input` (e.g., mobile).
- Safely resolve inputs:
  ```typescript
  const elements = host.ui.resolve(e)
  const Input = 'Input' in elements ? elements.Input : undefined
  ```

### Adaptive Split View
Branch on `props.bodyColumns >= 90`:
- **Split View ($\ge 90$)**: Left card sidebar (`width={36}`), right markdown detail pane (`flexGrow={1}`).
- **Master-Detail ($< 90$)**: Overview list with drill-down detail view and back navigation (`← Overview (b)`).
- **Keyboard Shortcuts**: Use single lowercase letters:
  - `p` / `n`: Previous / Next item
  - `b`: Back to overview
  - `c`: Clear search filter

---

## 4. State Management

- **`$.state`**: Ephemeral UI state (active tab, search filter, selected card). Survives hot reload within a session.
- **`$.store`**: Persistent state across sessions.
- **Module-level variables**: Reset on plugin hot reload; do not rely on global variables for persistent state.
