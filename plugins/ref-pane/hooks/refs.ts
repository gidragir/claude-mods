// Core: find references like RV-1 / Q-L1 in text and pull their section from the features/<TICKET>/ artifacts or from docs/*.md near cwd.

export type Ref = {
  id: string // canonical form: RV-001
  file: string // absolute path to the md file
  line: number // 1-based
  text: string // whole section (truncated)
}

export type FsLike = {
  list: (path?: string) => Promise<{ name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }[]>
  read: (path: string) => Promise<string>
}

// Number: 26, or a lettered form: L1, P21 (Q-L1, Q-P21).
const ID_SRC = String.raw`(?<![\w-])([A-Z]{1,4})-(\d{1,4}|[A-Z]{1,2}\d{1,4})(?![\w-])`
const ID = new RegExp(ID_SRC, 'g') // for matchAll (it clones the regex, lastIndex is not shared)
const ID_FIRST = new RegExp(ID_SRC) // no g flag: stateless
const DIRS = ['review', 'feedback', 'tasklist', 'prd', 'research', 'plan', 'adr', 'debug']
/** Prefix → default artifact directory; overridden by the `prefixes` option (userConfig in plugin.json). */
export const HOME: Record<string, string> = {
  RV: 'review',
  FB: 'feedback',
  T: 'tasklist',
  TASK: 'tasklist',
  ADR: 'adr',
  DBG: 'debug',
  OQ: 'prd',
  BQ: 'prd',
  RD: 'prd',
  D: 'plan',
  Q: 'prd',
  FR: 'prd',
  NFR: 'prd',
  AC: 'prd',
  US: 'prd',
}
const MAX_SECTION = 4000

/** "RV=review, FB=feedback, ADR" → { RV: 'review', FB: 'feedback', ADR: 'adr' }; without "=" the directory is the lowercase prefix. */
export function parsePrefixes(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of src.split(/[,;\n]/)) {
    const [p = '', d = ''] = part.split('=').map(x => x.trim())
    if (/^[A-Z]{1,4}$/.test(p)) out[p] = d || p.toLowerCase()
  }
  return out
}

/** RV-1 → RV-001; a lettered number stays as is: Q-L1. */
export const canon = (prefix: string, n: string) => `${prefix}-${/^\d+$/.test(n) ? n.padStart(3, '0') : n}`

/** Unique IDs in order of appearance. TICKET-123 does not match: the prefix is longer than 4 letters. */
export function findIds(text: string): string[] {
  const seen: string[] = []
  for (const m of text.matchAll(ID)) {
    const id = canon(m[1]!, m[2]!)
    if (!seen.includes(id)) seen.push(id)
  }
  return seen
}

/** A line defines `id` if it is the first ID in it (not "closes OQ-1" somewhere in the tail). */
const leadsWith = (s: string, id: string) => {
  const m = ID_FIRST.exec(s)
  return m !== null && canon(m[1]!, m[2]!) === id
}

/** Section of item `id` in md: a heading, a table row or a list item. */
export function extractSection(md: string, id: string): { line: number; text: string } | undefined {
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const h = /^(#{1,6})\s/.exec(l)
    if (h && leadsWith(l, id)) {
      let end = i + 1
      while (end < lines.length) {
        const n = /^(#{1,6})\s/.exec(lines[end]!)
        if (n && n[1]!.length <= h[1]!.length) break
        end++
      }
      return { line: i + 1, text: lines.slice(i, end).join('\n').trim().slice(0, MAX_SECTION) }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const head = l.slice(0, 24)
    if (/^\s*(\||[-*]\s|\d+\.\s|\*\*)/.test(l) && leadsWith(head, id)) {
      if (l.trimStart().startsWith('|')) return { line: i + 1, text: l.trim() }
      let end = i + 1
      while (end < lines.length && /^(\s{2,}\S|\s*$)/.test(lines[end]!) && end - i < 12) end++
      return { line: i + 1, text: lines.slice(i, end).join('\n').trim().slice(0, MAX_SECTION) }
    }
  }
  return closedBy(lines, id)
}

/** A question without its own entry: look for a decision that "closes" it (`- RD-4 (closes OQ-1). …`; the Russian "закрывает" is also recognised). */
function closedBy(lines: string[], id: string): { line: number; text: string } | undefined {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const by = /(?:closes|закрыва[а-яё]*)\s+([^).]*)/i.exec(l)
    if (!by || !findIds(by[1]!).includes(id)) continue
    const lead = findIds(l.slice(0, 24))[0]
    if (lead === undefined || lead === id) continue
    let end = i + 1
    while (end < lines.length && /^(\s{2,}\S|\s*$)/.test(lines[end]!) && end - i < 12) end++
    const body = lines.slice(i, end).join('\n').trim().slice(0, MAX_SECTION)
    return { line: i + 1, text: `**${id}** closed by decision **${lead}**:\n\n${body}` }
  }
  return undefined
}

const isDocsRoot = (r: string) => r.endsWith('/docs')

/**
 * `features` and `docs` directories named in the text by an absolute path
 * (`D:\...\my-repo\features\TICKET-1`, `D:\...\My Project\docs\decisions.md`).
 * Spaces are allowed in the path, but not a colon: two paths on one line are not glued together.
 */
export function rootsIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/[A-Za-z]:[\\/][^\r\n:`"'<>|*?]*?[\\/](?:features|docs)(?![\w-])/g)) {
    const r = m[0].replaceAll('\\', '/')
    if (!out.includes(r)) out.push(r)
  }
  return out
}

/** Ticket directories: first those mentioned in the text, then by recency. */
async function ticketDirs(fs: FsLike, roots: string[], hint: string) {
  const all: { name: string; path: string; mtimeMs: number }[] = []
  for (const root of roots) {
    const entries = await fs.list(root).catch(() => [])
    for (const e of entries) if (e.kind === 'dir') all.push({ name: e.name, path: `${root}/${e.name}`, mtimeMs: e.mtimeMs })
  }
  // The ticket name is mentioned as a whole word: TICKET-1230 does not count as a mention of TICKET-123.
  const mentions = (key: string) =>
    key !== '' && new RegExp(`(?<![\\w-])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(hint)
  const mentioned = all.filter(d => mentions(d.name.split(/[-_ ]/).slice(0, 2).join('-')))
  const rest = all.filter(d => !mentioned.includes(d)).sort((x, y) => y.mtimeMs - x.mtimeMs)
  return (mentioned.length > 0 ? mentioned : rest).map(d => d.path)
}

/** docs directories near cwd: cwd itself, its parent and grandparent (the session may sit in a project subfolder). */
function docDirs(cwd: string | undefined): string[] {
  if (!cwd) return []
  const parts = cwd.replaceAll('\\', '/').replace(/[/]+$/, '').split('/')
  const out: string[] = []
  for (let up = 0; up < 3 && parts.length - up > 1; up++) out.push(`${parts.slice(0, parts.length - up).join('/')}/docs`)
  return out
}

/** `known` — features directories seen earlier in the session; `cwd/features` is always checked. */
export async function resolveRefs(
  fs: FsLike,
  cwd: string | undefined,
  ids: string[],
  hint: string,
  known: string[] = [],
  prefixes: Record<string, string> = HOME,
): Promise<Ref[]> {
  // Only prefixes that mean something in artifacts: UTF-8, SHA-256, GPT-4 do not trigger a directory walk.
  ids = ids.filter(id => prefixes[id.split('-')[0]!] !== undefined)
  const dirs = [...DIRS, ...Object.values(prefixes).filter(d => !DIRS.includes(d))]
  if (ids.length === 0) return []
  const cwdRoot = cwd ? [`${cwd.replaceAll('\\', '/')}/features`] : [] // cwd unavailable (e.g. in tests): known roots only
  const roots = [...rootsIn(hint), ...known, ...cwdRoot].filter((r, i, a) => a.indexOf(r) === i)
  const tickets = await ticketDirs(
    fs,
    roots.filter(r => !isDocsRoot(r)),
    hint,
  )
  const out: Ref[] = []
  const cache = new Map<string, string | null>()
  const load = async (p: string) => {
    if (!cache.has(p)) cache.set(p, await fs.read(p).catch(() => null))
    return cache.get(p)!
  }
  // Directory listings are cached per call: each ID does not re-read them.
  const listed = new Map<string, string[]>()
  const mdFiles = async (dir: string) => {
    let names = listed.get(dir)
    if (names === undefined) {
      names = (await fs.list(dir).catch(() => []))
        .filter(f => f.kind === 'file' && f.name.endsWith('.md') && !/_humanized|_presentation/.test(f.name))
        .map(f => f.name)
      listed.set(dir, names)
    }
    return names
  }
  // docs/*.md: flat project documents (decisions.md, 40-open-questions.md). A table row or a heading is
  // a definition; a list item ("- Decisions: D-26, D-27 rejected") is only a mention, used if there is no definition.
  // docs named in the text come first, then docs near cwd
  const docs = [...roots.filter(isDocsRoot), ...docDirs(cwd)].filter((r, i, a) => a.indexOf(r) === i)
  const fromDocs = async (id: string): Promise<Ref | undefined> => {
    let weak: Ref | undefined
    for (const dir of docs) {
      for (const name of await mdFiles(dir)) {
        const file = `${dir}/${name}`
        const md = await load(file)
        const sec = md && extractSection(md, id)
        if (!sec) continue
        const ref = { id, file, line: sec.line, text: sec.text }
        if (/^\s*[|#]/.test(sec.text)) return ref
        weak ??= ref
      }
    }
    return weak
  }
  for (const id of ids) {
    const prefix = id.split('-')[0]!
    const home = prefixes[prefix]
    const order = home ? [home, ...dirs.filter(d => d !== home)] : dirs
    let found: Ref | undefined = await fromDocs(id)
    if (!found)
      search: for (const t of tickets) {
        for (const d of order) {
          for (const name of await mdFiles(`${t}/${d}`)) {
            const file = `${t}/${d}/${name}`
            const md = await load(file)
            const sec = md && extractSection(md, id)
            if (sec) {
              found = { id, file, line: sec.line, text: sec.text }
              break search
            }
          }
        }
      }
    if (found) out.push(found)
  }
  return out
}

export const shortPath = (p: string) => p.replace(/^.*[/]features[/]/, 'features/')

/** Entry heading and short gist: the first ~`max` characters of the body. */
export function gistOf(text: string, max = 200): { head: string; gist: string } {
  const [first = '', ...rest] = text.split('\n')
  const head = first.replace(/^[#\s>*-]+/, '').replace(/\*\*/g, '')
  const body = rest
    .filter(l => l.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
  const src = body === '' ? head : body
  return { head: head.slice(0, 90), gist: src.length > max ? `${src.slice(0, max)}…` : src }
}
