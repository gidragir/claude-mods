import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Comment, Draft, Editing } from '../types'
import { appendComments, countLabel, preview } from './comments'
import { renderCard, renderEmptyState } from './ui'

const COMMAND = 'comment'
const PANE = 'quote-comments'
const TITLE = 'Comments'
const comments = atom({ plugin: 'quote-comments', key: 'comments' } as const, [] as Comment[])
// the selection captured and waiting for its comment
const draft = atom({ plugin: 'quote-comments', key: 'draft' } as const, null as Draft | null)
// survives hot reload, so ids stay unique within the session
const nextId = atom({ plugin: 'quote-comments', key: 'nextId' } as const, 1)
// active comment being edited
const editing = atom({ plugin: 'quote-comments', key: 'editing' } as const, null as Editing)

const NO_PANE =
  'No selection is shared here and the Comments pane cannot be shown: select text in the chat first (in the terminal this works in fullscreen mode only).'

const add = async ($: EngineInterface, quote: string, ref: string | undefined, note: string) => {
  const id = await read($, nextId)
  await update($, nextId, n => n + 1)
  await update($, comments, list => [...list, { id, quote, ...(ref === undefined ? {} : { ref }), note: note.trim() }])
}

// Reads the selection; with a note it is saved at once, otherwise it waits in the pane for one.
// Where the surface shares no selection (VS Code, the terminal's main screen) the pane asks to paste the quote.
// Resolves 'saved', 'draft', 'paste', or 'hidden' when no surface placed the pane.
const capture = async ($: EngineInterface, note: string): Promise<'saved' | 'draft' | 'paste' | 'hidden'> => {
  await update($, editing, () => null)
  const selected = await $.ui.selection()
  const text = note.trim()
  let kind: 'saved' | 'draft' | 'paste'
  if (selected === undefined || selected.text.trim() === '') {
    kind = 'paste'
    await update($, draft, () => ({ quote: '', ...(text === '' ? {} : { note: text }) }))
  } else if (text !== '') {
    kind = 'saved'
    await add($, selected.text, selected.requestId, text)
    await update($, draft, () => null)
  } else {
    kind = 'draft'
    await update($, draft, () => ({ quote: selected.text, ...(selected.requestId === undefined ? {} : { ref: selected.requestId }) }))
  }
  const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, focus: true })
  return isPlaced || kind === 'saved' ? kind : 'hidden'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Comment on the text selected in the chat; the comment is appended to your next message',
      argumentHint: '[comment]',
    })
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const kind = await capture($, e.args)
    if (kind === 'hidden') return { text: NO_PANE }
    if (kind === 'saved') $.ui.toast(`Comment saved: ${countLabel((await read($, comments)).length)} for your next message`)
    if (kind === 'paste') $.ui.toast('The selection is not shared here: paste the quote into the Comments pane')
    return {}
  }).catch((_$, e, next) => (next.called ? next(e) : { text: 'quote-comments: command error.' }))

  // Appends the collected comments to the user's own message, then starts over.
  on('prompt.submit', async ($, e, next) => {
    const list = await read($, comments)
    if (e.command !== undefined || e.isMeta === true || list.length === 0) return next(e)
    const result = await next({ ...e, text: appendComments(e.text, list) })
    await update($, comments, () => [])
    await update($, draft, () => null)
    await update($, editing, () => null)
    await $.ui.close({ id: PANE })
    return result
  }).catch((_$, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // mobile draws no Input: the comment then goes in with /comment <text>
    const Input = 'Input' in els ? els.Input : undefined
    const list = await read($, comments)
    const pending = await read($, draft)
    const activeEdit = await read($, editing)
    const width = Math.max(20, e.props.bodyColumns - 24)

    // VS Code shares no selection: the button asks for a paste there and puts the cursor in that field
    const isPasteOnly = e.surface === 'vscode'
    const pick = async () => {
      if ((await capture($, '')) === 'paste') await $.ui.focus({ requestId: PANE, key: 'quote' }).catch(() => undefined)
    }
    const save = async (quote: string, note: string) => {
      if (pending === null || note.trim() === '') return
      await add($, quote, pending.ref, note)
      await update($, draft, () => null)
    }
    const send = async () => {
      const box = await $.prompt.read().catch(() => ({ text: '', cursor: 0 }))
      const currentList = await read($, comments)
      const text = appendComments(box.text, currentList)
      if (text.trim() === '') return
      await update($, comments, () => [])
      await update($, draft, () => null)
      await update($, editing, () => null)
      if (box.text !== '') await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => undefined)
      await $.ui.close({ id: PANE }).catch(() => undefined)
      await $.prompt.submit({ text, asUser: true })
    }

    return (
      <Box flexDirection="column">
        {pending !== null &&
          renderCard({
            elements: els,
            key: 'draft-card',
            isSelected: true,
            children: (
              <Box flexDirection="column">
                {pending.quote === '' ? (
                  <Text dimColor>The selection is not shared here: copy the text from the chat and paste it below.</Text>
                ) : (
                  <Text dimColor>Commenting on: “{preview(pending.quote, width)}”</Text>
                )}
                {Input === undefined ? (
                  <Text dimColor>This surface takes no input: select the text in the terminal or desktop app.</Text>
                ) : pending.quote === '' ? (
                  <Input
                    key="quote"
                    autoFocus
                    rows={3}
                    placeholder="Paste the quoted text, Enter to continue"
                    submitLabel="next"
                    onSubmit={async (value: string) => {
                      if (value.trim() === '') return
                      if (pending.note !== undefined) await save(value, pending.note)
                      else await update($, draft, d => (d === null ? d : { ...d, quote: value }))
                    }}
                  />
                ) : (
                  <Input
                    key="note"
                    autoFocus
                    placeholder="Your comment, Enter to save"
                    submitLabel="save"
                    onInput={(value: string) => update($, draft, d => (d === null ? d : { ...d, note: value }))}
                    onSubmit={(value: string) => save(pending.quote, value)}
                  />
                )}
                <Box flexDirection="row" gap={1}>
                  {pending.quote !== '' && (
                    <Button
                      key="save"
                      label="Save"
                      variant="primary"
                      onPress={async () => {
                        const current = await read($, draft)
                        const noteToSave = (current?.note ?? pending.note ?? '').trim()
                        if (noteToSave !== '') {
                          await save(pending.quote, noteToSave)
                        }
                      }}
                    />
                  )}
                  <Button key="cancel" label="Cancel" onPress={() => update($, draft, () => null)} />
                </Box>
              </Box>
            ),
          })}
        {list.length === 0 &&
          pending === null &&
          renderEmptyState(
            els,
            isPasteOnly
              ? 'Copy text from the chat, then press “+ Paste Quote” or run /comment.'
              : 'Select text in the chat, then press “+ Add Comment” or run /comment.',
          )}
        {list.map((c, i) => {
          const isEditing = activeEdit !== null && activeEdit.id === c.id
          return renderCard({
            elements: els,
            key: `card-${c.id}`,
            isSelected: isEditing,
            children: isEditing ? (
              <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Text>
                    <Text bold>[{i + 1}]</Text> <Text dimColor>“{preview(c.quote, width)}”</Text>
                  </Text>
                  {c.ref !== undefined && (
                    <Button key={`go-${c.id}`} label="↗ Jump" onPress={() => $.ui.scroll({ to: { requestId: c.ref! }, block: 'center' })} />
                  )}
                </Box>
                {Input === undefined ? (
                  <Text dimColor>This surface takes no input.</Text>
                ) : (
                  <Input
                    key={`edit-note-${c.id}`}
                    autoFocus
                    value={activeEdit.note}
                    placeholder="Edit comment, Enter to save"
                    submitLabel="save"
                    onInput={(val: string) => update($, editing, e => (e === null ? e : { ...e, note: val }))}
                    onSubmit={async (value: string) => {
                      const text = value.trim()
                      if (text !== '') {
                        await update($, comments, all => all.map(x => (x.id === c.id ? { ...x, note: text } : x)))
                      }
                      await update($, editing, () => null)
                    }}
                  />
                )}
                <Box flexDirection="row" gap={1}>
                  <Button
                    key={`save-${c.id}`}
                    label="Save"
                    variant="primary"
                    onPress={async () => {
                      const current = await read($, editing)
                      const text = (current?.note ?? activeEdit?.note ?? '').trim()
                      if (text !== '') {
                        await update($, comments, all => all.map(x => (x.id === c.id ? { ...x, note: text } : x)))
                      }
                      await update($, editing, () => null)
                    }}
                  />
                  <Button key={`cancel-${c.id}`} label="Cancel" onPress={() => update($, editing, () => null)} />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Text>
                    <Text bold>[{i + 1}]</Text> <Text dimColor>“{preview(c.quote, width)}”</Text>
                  </Text>
                  {c.ref !== undefined && (
                    <Button key={`go-${c.id}`} label="↗ Jump" onPress={() => $.ui.scroll({ to: { requestId: c.ref! }, block: 'center' })} />
                  )}
                </Box>
                <Box marginY={0}>
                  <Text>{c.note}</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Button
                    key={`edit-${c.id}`}
                    label="Edit"
                    onPress={async () => {
                      await update($, draft, () => null)
                      await update($, editing, () => ({ id: c.id, note: c.note }))
                    }}
                  />
                  <Button
                    key={`del-${c.id}`}
                    label="Delete"
                    onPress={async () => {
                      await update($, comments, all => all.filter(x => x.id !== c.id))
                      await update($, editing, curr => (curr?.id === c.id ? null : curr))
                    }}
                  />
                </Box>
              </Box>
            ),
          })
        })}
        <Box flexDirection="row" gap={1}>
          <Button key="pick" label={isPasteOnly ? '+ Paste Quote' : '+ Add Comment'} hotkey="c" onPress={pick} />
          {list.length > 0 && <Button key="send" label="Append all to Chat" variant="primary" onPress={send} />}
          {list.length > 0 && (
            <Button
              key="clear"
              label="Clear all"
              onPress={async () => {
                await update($, comments, () => [])
                await update($, draft, () => null)
                await update($, editing, () => null)
              }}
            />
          )}
        </Box>
        {list.length > 0 && <Text dimColor>{countLabel(list.length)} will be appended to your next message.</Text>}
      </Box>
    )
  })
}
