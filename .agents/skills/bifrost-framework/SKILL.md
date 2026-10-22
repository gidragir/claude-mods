---
name: bifrost-framework
description: The @gidragir/bifrost public API as a plugin author uses it - definePlugin, atom/useAtom/useState, the Host interface, UI primitives and components, the bifrost build/dev CLI. Use when writing or changing plugin code under plugins/<mod>/src, including when a needed component or helper seems missing.
---

# Bifrost framework

Full reference: [packages/bifrost/README.md](../../../packages/bifrost/README.md).

## Plugin shape

```tsx
import { atom, definePlugin, MasterDetail, Markdown, useAtom, useHost, useValue } from '@gidragir/bifrost'

const items = atom('items', [] as Item[])
const selected = atom('selected', null as string | null)

function Pane() {
  const host = useHost()
  const list = useValue(items)
  const [sel, setSel] = useAtom(selected)
  return (
    <MasterDetail items={list} selectedId={sel} onSelect={setSel} getId={x => x.id}
      detail={x => <Markdown text={x.body} />} />
  )
}

export default definePlugin({
  name: 'my-plugin', version: '0.1.0', description: '…',
  config: { mode: { type: 'string', title: 'Mode', default: '' } },
  panes: { main: { title: 'Mine', component: Pane, onOpen: async host => { /* load */ } } },
  commands: { mine: { description: '…', run: async (host, args) => { await host.pane.open('main'); return 'Opened.' } } },
  claude: { turnComplete: async (host, e) => {}, promptSubmit: async (host, e) => undefined },
})
```

## Rules of thumb

- **State**: `atom(key, initial)` at module level; `useAtom` / `useValue` in components;
  `host.get` / `host.set(atom, value | prev => next)` in handlers. `useState('key', initial)` is sugar:
  keep the key a literal. Values are plain data.
- **Host** (`useHost()`, or the first argument of commands/events): `fs`, `cwd()`, `config(key)`,
  `selection()`, `prompt.append/replace/read/submit`, `toast`, `pane.open/close/focus`, `scrollTo`.
  Never throws; degrades where a harness lacks a capability. Never import `claude-code` or Node in `src`.
- **UI**: primitives `Box Text Button Input Select Markdown Code Link`; components `Card Row Column
  Header Toolbar EmptyState Field SearchInput MasterDetail`; `truncate`, `plural`; `useViewport()` →
  `{ harness, surface, columns, canInput, wide }`. Give interactive elements a `key`. `Box kind="card"`
  etc. picks the semantic HTML element in agy.
- Components are plain functions called eagerly; hooks are keyed by atom, so conditions and loops are fine.
- `claude.promptSubmit` returns a new text, `{ text, after }` (run `after` once the prompt went through),
  or `undefined` to pass.

## Missing piece

No `Badge`, no `Tabs`? Write it in the plugin from primitives (`plugins/<mod>/src/badge.tsx`:
`<Text bold color="green">[ACCEPTED]</Text>`). The API above is all a plugin gets; changing Bifrost is a
framework task with its own instructions ([packages/bifrost/AGENTS.md](../../../packages/bifrost/AGENTS.md)),
never part of plugin work (see `cross-mod`).
