import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { appendComments, countLabel, preview } from './comments'

const COMMAND = 'comment'
const PANE = 'quote-comments'
const TITLE = 'Comments'
const comments = atom({ plugin: 'quote-comments', key: 'comments' } as const, [])
// the selection captured and waiting for its comment
const draft = atom({ plugin: 'quote-comments', key: 'draft' } as const, null)
// survives hot reload, so ids stay unique within the session
const nextId = atom({ plugin: 'quote-comments', key: 'nextId' } as const, 1)

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
      const box = await $.prompt.read()
      await $.prompt.fill({ text: '', mode: 'replace' })
      await $.prompt.submit({ text: box.text })
    }

    return (
      <Box flexDirection="column">
        {pending !== null && (
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
                onSubmit={(value: string) => save(pending.quote, value)}
              />
            )}
            <Button key="cancel" label="Cancel" onPress={() => update($, draft, () => null)} />
          </Box>
        )}
        {list.length === 0 && pending === null && (
          <Text dimColor>
            {isPasteOnly
              ? 'Copy text from the chat, then press “Paste quote” or run /comment.'
              : 'Select text in the chat, then press “Comment selection” or run /comment.'}
          </Text>
        )}
        {list.map((c, i) => (
          <Box key={`row-${c.id}`}>
            <Text>
              [{i + 1}] <Text dimColor>“{preview(c.quote, width)}”</Text> {preview(c.note, width)}
            </Text>
            {c.ref !== undefined && (
              <Button key={`go-${c.id}`} label="↗" onPress={() => $.ui.scroll({ to: { requestId: c.ref! }, block: 'center' })} />
            )}
            <Button key={`del-${c.id}`} label="✕" onPress={() => update($, comments, all => all.filter(x => x.id !== c.id))} />
          </Box>
        ))}
        <Box>
          <Button key="pick" label={isPasteOnly ? '💬 Paste quote' : '💬 Comment selection'} hotkey="c" onPress={pick} />
          {list.length > 0 && <Button key="send" label="Send now" onPress={send} />}
          {list.length > 0 && <Button key="clear" label="Clear all" onPress={() => update($, comments, () => [])} />}
        </Box>
        {list.length > 0 && <Text dimColor>{countLabel(list.length)} will be appended to your next message.</Text>}
      </Box>
    )
  })
}
