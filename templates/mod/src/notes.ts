// Pure logic: no host, no state. Easy to unit-test (test/notes.test.ts).

export type Note = { id: string; text: string }

/** A note from a command's arguments; `undefined` for blank input. */
export function noteFrom(args: string, id: number): Note | undefined {
  const text = args.trim()
  return text === '' ? undefined : { id: `N-${id}`, text }
}

/** The first line of a note, for the list. */
export const titleOf = (note: Note): string => note.text.split('\n')[0] ?? ''
