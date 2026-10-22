import { Box, Button, Card, Column, EmptyState, Field, Row, Text, useAtom, useHost, useValue, useViewport } from '@gidragir/bifrost'
import { type Comment, countLabel, preview } from './comments'
import { add, capture, clear, comments, draft, editing, PANE, sendAll } from './store'

const NO_INPUT = 'This surface takes no input: select the text in the terminal or desktop app.'

/** The pending comment: paste a quote first where no selection is shared, then the note. */
function DraftCard() {
  const host = useHost()
  const [pending, setPending] = useAtom(draft)
  const { columns } = useViewport()
  if (pending === null) return null
  const pasting = pending.quote === ''

  const save = async (quote: string, note: string) => {
    if (note.trim() === '') return
    await add(host, quote, pending.ref, note)
    await setPending(null)
  }
  const submit = async (value: string) => {
    if (!pasting) return save(pending.quote, value)
    if (value.trim() === '') return
    if (pending.note !== undefined) return save(value, pending.note)
    await setPending(d => (d === null ? d : { ...d, quote: value }))
  }

  return (
    <Card key="draft-card" selected>
      <Text dimColor>
        {pasting
          ? 'The selection is not shared here: copy the text from the chat and paste it below.'
          : `Commenting on: “${preview(pending.quote, Math.max(20, columns - 24))}”`}
      </Text>
      <Field
        key={pasting ? 'quote' : 'note'}
        autoFocus
        rows={pasting ? 3 : undefined}
        placeholder={pasting ? 'Paste the quoted text, Enter to continue' : 'Your comment, Enter to save'}
        submitLabel={pasting ? 'next' : 'save'}
        onInput={pasting ? undefined : value => setPending(d => (d === null ? d : { ...d, note: value }))}
        onSubmit={submit}
        fallback={NO_INPUT}
      />
      <Row>
        {pasting ? null : (
          <Button key="save" variant="primary" onPress={() => save(pending.quote, pending.note ?? '')}>
            Save
          </Button>
        )}
        <Button key="cancel" onPress={() => setPending(null)}>
          Cancel
        </Button>
      </Row>
    </Card>
  )
}

function CommentCard({ comment, index }: { comment: Comment; index: number }) {
  const host = useHost()
  const [edit, setEdit] = useAtom(editing)
  const [, setComments] = useAtom(comments)
  const { columns } = useViewport()
  const id = comment.id
  const isEditing = edit?.id === id

  const saveNote = async (value: string) => {
    const text = value.trim()
    if (text !== '') await setComments(all => all.map(x => (x.id === id ? { ...x, note: text } : x)))
    await setEdit(null)
  }

  return (
    <Box
      key={`card-${id}`}
      kind="card"
      borderStyle="round"
      borderColor={isEditing ? 'cyan' : undefined}
      borderDimColor={!isEditing}
      paddingX={1}
      flexDirection="column"
    >
      <Row justify="space-between">
        <Text>
          <Text bold>{`[${index + 1}]`}</Text> <Text dimColor>{`“${preview(comment.quote, Math.max(20, columns - 24))}”`}</Text>
        </Text>
        {comment.ref !== undefined ? (
          <Button key={`go-${id}`} onPress={() => host.scrollTo(comment.ref!)}>
            ↗ Jump
          </Button>
        ) : null}
      </Row>
      {isEditing ? (
        <Field
          key={`edit-note-${id}`}
          autoFocus
          value={edit.note}
          placeholder="Edit comment, Enter to save"
          submitLabel="save"
          onInput={value => setEdit(e => (e === null ? e : { ...e, note: value }))}
          onSubmit={saveNote}
          fallback="This surface takes no input."
        />
      ) : (
        <Text>{comment.note}</Text>
      )}
      <Row>
        {isEditing
          ? [
              <Button key={`save-${id}`} variant="primary" onPress={() => saveNote(edit.note)}>
                Save
              </Button>,
              <Button key={`cancel-${id}`} onPress={() => setEdit(null)}>
                Cancel
              </Button>,
            ]
          : [
              <Button
                key={`edit-${id}`}
                onPress={async () => {
                  await host.set(draft, null)
                  await setEdit({ id, note: comment.note })
                }}
              >
                Edit
              </Button>,
              <Button
                key={`del-${id}`}
                onPress={async () => {
                  await setComments(all => all.filter(x => x.id !== id))
                  await setEdit(e => (e?.id === id ? null : e))
                }}
              >
                Delete
              </Button>,
            ]}
      </Row>
    </Box>
  )
}

export function CommentsPane() {
  const host = useHost()
  const list = useValue(comments)
  const pending = useValue(draft)
  const { surface, harness } = useViewport()
  // VS Code and the agy webview cannot read the chat's selection: the quote is pasted
  const pasteOnly = surface === 'vscode' || harness === 'agy'

  const pick = async () => {
    if ((await capture(host, '')) === 'paste') await host.pane.focus('quote', PANE)
  }

  return (
    <Column>
      <DraftCard />
      {list.length === 0 && pending === null ? (
        <EmptyState
          message={
            pasteOnly
              ? 'Copy text from the chat, then press “+ Paste Quote” or run /comment.'
              : 'Select text in the chat, then press “+ Add Comment” or run /comment.'
          }
        />
      ) : null}
      {list.map((c, i) => (
        <CommentCard key={`comment-${c.id}`} comment={c} index={i} />
      ))}
      <Row>
        <Button key="pick" hotkey="c" onPress={pick}>
          {pasteOnly ? '+ Paste Quote' : '+ Add Comment'}
        </Button>
        {list.length > 0 ? (
          <Button key="send" variant="primary" onPress={() => sendAll(host)}>
            Append all to Chat
          </Button>
        ) : null}
        {list.length > 0 ? (
          <Button key="clear" onPress={() => clear(host)}>
            Clear all
          </Button>
        ) : null}
      </Row>
      {list.length > 0 ? <Text dimColor>{`${countLabel(list.length)} will be appended to your next message.`}</Text> : null}
    </Column>
  )
}
