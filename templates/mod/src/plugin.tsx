import {
  atom,
  Button,
  Column,
  definePlugin,
  EmptyState,
  Header,
  Markdown,
  MasterDetail,
  plural,
  Text,
  truncate,
  useAtom,
  useHost,
  useValue,
} from '@gidragir/bifrost'
import { type Note, noteFrom, titleOf } from './notes'

const COMMAND = '__MOD_NAME__'

// State: declared once, kept by the harness (Claude Code engine state, agy server memory).
const notes = atom('notes', [] as Note[])
const selected = atom('selected', null as string | null)
const counter = atom('counter', 1)

// One UI for both harnesses: the TUI pane in Claude Code and the aux-pane webview in Antigravity.
function NotesPane() {
  const host = useHost()
  const list = useValue(notes)
  const [sel, setSel] = useAtom(selected)
  return (
    <Column>
      <Header title="__MOD_NAME__" subtitle={plural(list.length, 'note')} />
      {list.length === 0 ? (
        <EmptyState framed message="No notes yet." hint="Add one with /__MOD_NAME__ <text>." />
      ) : (
        <MasterDetail
          items={list}
          selectedId={sel}
          onSelect={setSel}
          getId={n => n.id}
          preview={(n, width) => <Text dimColor>{truncate(titleOf(n), width)}</Text>}
          detail={n => <Markdown text={n.text} />}
          actions={n => (
            <Button key="quote" hotkey="a" onPress={() => host.prompt.append(`> ${n.text}\n\n`)}>
              Add to chat (a)
            </Button>
          )}
        />
      )}
    </Column>
  )
}

export default definePlugin({
  name: '__MOD_NAME__',
  version: '0.1.0',
  description: '__MOD_DESCRIPTION__',
  panes: {
    main: { title: '__MOD_NAME__', component: NotesPane },
  },
  commands: {
    [COMMAND]: {
      description: 'Add a note (/__MOD_NAME__ <text>) or open the pane',
      argumentHint: '[text]',
      run: async (host, args) => {
        const note = noteFrom(args, await host.get(counter))
        if (note) {
          await host.set(counter, n => n + 1)
          await host.set(notes, list => [note, ...list])
          await host.set(selected, note.id)
        }
        await host.pane.open('main', { focus: true })
        return note ? `Noted ${note.id}.` : undefined
      },
    },
  },
})
