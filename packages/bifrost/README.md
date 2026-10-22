# @gidragir/bifrost

Write a plugin once, run it in **Claude Code** (a pane in the terminal, desktop or VS Code) and **Google
Antigravity / agy** (the same pane in the aux-pane webview). You write state, logic and one UI in React-like
TSX; `bifrost build` generates everything each host needs.

```tsx
// plugins/counter/src/plugin.tsx
import { atom, Button, Card, definePlugin, Header, useAtom, useHost } from '@gidragir/bifrost'

const count = atom('count', 0) // kept by the host: engine state in Claude Code, server memory in agy

function CounterPane() {
  const [n, setN] = useAtom(count)
  const host = useHost()
  return (
    <Card selected>
      <Header title="COUNTER" subtitle={`${n} clicks`} />
      <Button key="inc" hotkey="i" onPress={() => setN(x => x + 1)}>+1 (i)</Button>
      <Button key="chat" onPress={() => host.prompt.append(`count is ${n}`)}>Add to chat</Button>
    </Card>
  )
}

export default definePlugin({
  name: 'counter',
  version: '0.1.0',
  description: 'Counts clicks',
  panes: { main: { title: 'Counter', component: CounterPane } },
  commands: {
    counter: { description: 'Open the counter', run: async host => void (await host.pane.open('main', { focus: true })) },
  },
})
```

```bash
pnpm dev counter          # build plugins/counter/dist and rebuild on save
pnpm dev:link:desktop     # Claude Desktop loads dist and hot-reloads it
pnpm dev:link:agy         # Antigravity loads dist (plugin + aux pane)
```

## What the framework does for you

| You write | Bifrost handles |
| --- | --- |
| `atom('items', [])`, `useAtom(items)` | Engine atoms with the literal refs the Claude scanner demands, the `PluginState` types contract, safe reads/writes, redraw on change; a memory store with SSE push in agy |
| `host.prompt.append(text)`, `host.selection()`, `host.toast()` … | `$.prompt.fill`, `$.ui.selection`, … in Claude Code; `postMessage`/clipboard/`sidecar.agent` in agy. Every call is guarded: a refused host call never rejects into the worker |
| `<Button>`, `<Card>`, `<MasterDetail>`, `<Field>` … | Text-only `Button` children, `Input` only where the surface draws one, the 90-column split vs drill-down, HTML + CSS for the webview |
| `commands`, `panes`, `claude.turnComplete` … | `on('<event>')` registration with `.catch` guards, `next(e)` chain preservation, `session.start` command registration, config tracking (`config.set`, blank = unset) |
| `src/plugin.tsx` | `.claude-plugin/plugin.json` (with `userConfig`), `hooks/hooks.json`, the bundled hooks module, `plugin.json` and `sidecars/<name>/sidecar.json` for Antigravity, the agy server, page, styles and client runtime |

## Concepts

### `definePlugin(spec)`

One object describes the plugin for every harness and for the build:

| Field | Meaning |
| --- | --- |
| `name`, `version`, `description`, `displayName?` | Metadata. `name` is kebab-case: the engine state namespace and the agy sidecar id |
| `author?`, `license?`, `repository?` | Default to the repository root `package.json` |
| `suggestedPrompts?` | Antigravity's suggested prompts |
| `config?` | `{ key: { type, title, description, default } }`: Claude Code `userConfig`; env `<NAME>_<KEY>` in agy. Read with `host.config(key)` |
| `panes?` | `{ id: { title?, component, onOpen? } }`: a Claude Code `Pane` and an agy aux-pane view each. `onOpen(host)` runs when the pane is shown |
| `commands?` | `{ name: { description, argumentHint?, run(host, args) } }`: slash commands (Claude Code). A returned string is shown as output |
| `claude?` | Claude-only events: `sessionStart`, `promptSubmit` (return a new text, or `{ text, after }`), `turnComplete`, `configChange` |
| `targets?` | `['claude', 'agy']` by default |

### State

```ts
const items = atom('items', [] as Ref[])        // module level: the build lists it
const [list, setList] = useAtom(items)          // in a component
await host.set(items, prev => [...prev, x])     // in a handler or command
const [q, setQ] = useState('query', '')         // sugar for useAtom(atom('query', '')): keep the key a string literal
```

Atoms are keyed by name, not by call order: hooks may sit in conditions and loops. Values must be plain
data (they cross the engine's IPC).

### Host

`useHost()` in components, the first argument of commands and events. The same interface everywhere:

| Member | Claude Code | agy |
| --- | --- | --- |
| `get/set(atom)` | engine state | server memory, pushes a redraw |
| `fs` (`FsLike`) | `$.fs` | `node:fs` |
| `cwd()` | session cwd | first workspace folder |
| `config(key)` | session value → `userConfig` → default | env `<NAME>_<KEY>` → default |
| `selection()` | the chat selection | text selected in the pane |
| `prompt.append/replace/read/submit` | the prompt box | chat insert / clipboard / `sidecar.agent.sendMessage` |
| `toast`, `pane.open/close/focus`, `scrollTo` | native | toast; others no-op |

### UI

Primitives (the eight elements every surface knows): `Box`, `Text`, `Button`, `Input`, `Select`,
`Markdown`, `Code`, `Link`. Components: `Card`, `Row`, `Column`, `Header`, `Toolbar`, `EmptyState`,
`Field`, `SearchInput`, `MasterDetail`. Helpers: `truncate`, `plural`. `useViewport()` gives
`{ harness, surface, columns, canInput, wide }`.

`Box` takes a `kind` hint (`card`, `list`, `toolbar`, `header`, `detail`, `section`) that the web
renders as the matching semantic element; the TUI ignores it. Give interactive elements a `key`: it is
how tests and the agy page address them.

## Testing

```ts
import { createTestHost, mount, runCommand, submitPrompt, completeTurn } from '@gidragir/bifrost/testing'

const host = createTestHost(plugin, { files: { '/ws/a.md': '# A' }, cwd: '/ws', selection: 'text' })
await runCommand(plugin, 'ref', 'RV-1', { host })
const ui = await mount(plugin, 'refs', { host, columns: 120 })
await ui.press('pick-RV-001')
expect(ui.find({ text: /RV-001/ })).toBeDefined()
expect(ui.html()).toContain('<article')   // the agy rendering of the same tree
```

`bun test` runs these in milliseconds. Engine tests (`test/engine/*.ts`, importing `claude-code/testing`)
are copied to `dist/tests/` and run by `claude plugin test` against the built plugin (`pnpm check`).

## Layout of a plugin

```
plugins/<name>/
  src/plugin.tsx          definePlugin: the only required file
  src/*.ts(x)             logic and components
  src/claude.ts           optional raw engine hooks module (advanced; bundled next to the generated one)
  test/*.test.ts(x)       Bun tests          test/engine/*.ts   engine tests
  skills/, rules/, docs/  copied into dist   README.md          copied into dist
  dist/                   generated: install, link and release this folder
```

## Package entries

| Import | For |
| --- | --- |
| `@gidragir/bifrost` | plugin code: `definePlugin`, state, hooks, primitives, components, `FsLike` helpers |
| `@gidragir/bifrost/testing` | Bun tests |
| `@gidragir/bifrost/claude`, `/agy` | used by the generated entries; not imported by plugins |
| `@gidragir/bifrost/cli`, `bifrost` bin | `bifrost build|dev [dir…]` |

`node build.mjs` produces the publishable package in `dist/` (with its own `package.json`); inside this
monorepo the exports point at `src` and Bun/esbuild read TypeScript directly.
