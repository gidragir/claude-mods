import {
  Button,
  Column,
  EmptyState,
  Header,
  Markdown,
  MasterDetail,
  plural,
  SearchInput,
  Text,
  truncate,
  useAtom,
  useHost,
  useValue,
} from '@gidragir/bifrost'
import { gistOf, type Ref, shortPath } from './refs'
import { addToChat, items, lookup, query, selected, status } from './store'

const matches = (item: Ref, q: string) => [item.id, item.text, item.file].some(s => s.toLowerCase().includes(q))

export function RefsPane() {
  const host = useHost()
  const list = useValue(items)
  const last = useValue(status)
  const [sel, setSel] = useAtom(selected)
  const [q, setQ] = useAtom(query)

  const needle = q.trim().toLowerCase()
  const shown = needle === '' ? list : list.filter(x => matches(x, needle))
  const subtitle =
    list.length === 0
      ? '(0 refs)'
      : shown.length === list.length
        ? plural(shown.length, 'ref')
        : `${plural(shown.length, 'ref')} (filtered from ${list.length})`

  return (
    <Column>
      <Header
        title="REFS PANE"
        subtitle={subtitle}
        actions={
          needle !== '' ? (
            <Button key="clear-filter" hotkey="c" onPress={() => setQ('')}>
              Clear (c)
            </Button>
          ) : null
        }
      />
      <SearchInput
        key="search-input"
        value={q}
        placeholder="Filter or query reference IDs (e.g. RV-1, FB-2, T-3)..."
        onInput={setQ}
        onSubmit={async value => {
          await setQ(value)
          const hit = await lookup(host, value)
          if (hit && hit.found.length > 0) await setSel(hit.found[0]!.id)
        }}
      />
      {list.length === 0 ? (
        <EmptyState
          framed
          message="No references yet. They will appear from the model's answer or via /ref RV-1."
          hint={last !== '' ? `Last search: ${last}` : undefined}
        />
      ) : shown.length === 0 ? (
        <EmptyState framed message={`No refs matching "${q.trim()}".`} />
      ) : (
        <MasterDetail
          items={shown}
          selectedId={sel}
          onSelect={setSel}
          getId={x => x.id}
          meta={x => `${shortPath(x.file)}:${x.line}`}
          preview={(x, width) => {
            const g = gistOf(x.text)
            return [
              g.head !== '' ? (
                <Text bold color={x.id === sel ? 'cyan' : undefined}>
                  {truncate(g.head, Math.max(16, width))}
                </Text>
              ) : null,
              g.gist !== '' ? <Text dimColor>{truncate(g.gist, Math.max(16, width))}</Text> : null,
            ]
          }}
          detail={x => <Markdown key={`md-${x.id}`} text={x.text} />}
          actions={x => (
            <Button key="add-context" hotkey="a" onPress={() => addToChat(host, x)}>
              Add to chat (a)
            </Button>
          )}
        />
      )}
    </Column>
  )
}
