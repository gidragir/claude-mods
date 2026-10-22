import { expect, test } from 'bun:test'

import { discoverRefs, extractSection, findIds, HOME, parsePrefixes, resolveRefs, rootsIn } from '../src/refs'

test('findIds: RV-1 and RV-001 are the same, ticket TICKET-123 is not a reference', () => {
  expect(findIds('see RV-1, RV-001 and FB-12 for TICKET-123')).toEqual(['RV-001', 'FB-012'])
})

test('extractSection: heading up to the next one of the same level', () => {
  const md = '# Review\n### RV-001 — A\ntext\n\n### RV-002 — B\nother'
  expect(extractSection(md, 'RV-001')).toEqual({ line: 2, text: '### RV-001 — A\ntext' })
})

test('extractSection: table row', () => {
  expect(extractSection('| RV-3 | minor | x |', 'RV-003')?.line).toBe(1)
})

test('resolveRefs: looks in review first for RV', async () => {
  const files: Record<string, string> = { 'c/features/T-1/review/review.md': '### RV-001 — A\nx' }
  const fs = {
    list: async (p?: string) =>
      p === 'c/features'
        ? [{ name: 'T-1', kind: 'dir' as const, mtimeMs: 1 }]
        : p === 'c/features/T-1/review'
          ? [{ name: 'review.md', kind: 'file' as const, mtimeMs: 1 }]
          : [],
    read: async (p: string) => files[p] ?? Promise.reject(new Error('no')),
  }
  const r = await resolveRefs(fs, 'c', ['RV-001'], '')
  expect(r[0]?.line).toBe(1)
})

test('resolveRefs: noisy tokens (UTF-8, SHA-256) do not touch the file system', async () => {
  let calls = 0
  const fs = {
    list: async () => {
      calls++
      return []
    },
    read: async () => {
      calls++
      return ''
    },
  }
  expect(await resolveRefs(fs, 'c', ['UTF-008', 'SHA-256', 'GPT-004'], '')).toEqual([])
  expect(calls).toBe(0)
})

test('resolveRefs: a directory listing is read once for several IDs', async () => {
  const listed: string[] = []
  const fs = {
    list: async (p?: string) => {
      listed.push(p ?? '')
      return p === 'c/features' ? [{ name: 'T-1', kind: 'dir' as const, mtimeMs: 1 }] : []
    },
    read: async () => '',
  }
  await resolveRefs(fs, 'c', ['RV-001', 'RV-002', 'FB-001'], '')
  expect(listed.length).toBe(new Set(listed).size)
})

test('extractSection: a mention in the tail of a line is not a definition', () => {
  const r = extractSection('- RD-4 (closes OQ-1). text', 'OQ-001')
  expect(r?.line).toBe(1)
  expect(r?.text.startsWith('**OQ-001** closed by decision **RD-004**')).toBe(true)
  expect(extractSection('- RD-4 (closes OQ-1). text', 'RD-004')?.line).toBe(1)
})

test('rootsIn: features path from text, backslashes are normalised', () => {
  expect(rootsIn('see D:\\work\\my-repo\\features\\TICKET-1 and `E:/x/features/`')).toEqual(['D:/work/my-repo/features', 'E:/x/features'])
})

test('resolveRefs: ticket TICKET-1230 is not taken for the mentioned TICKET-123', async () => {
  const files: Record<string, string> = {
    'c/features/TICKET-1230/review/review.md': '### RV-001 — foreign\nx',
    'c/features/TICKET-123/review/review.md': '### RV-001 — own\nx',
  }
  const fs = {
    list: async (p?: string) => {
      if (p === 'c/features')
        return [
          { name: 'TICKET-1230', kind: 'dir' as const, mtimeMs: 2 },
          { name: 'TICKET-123', kind: 'dir' as const, mtimeMs: 1 },
        ]
      return p?.endsWith('/review') ? [{ name: 'review.md', kind: 'file' as const, mtimeMs: 1 }] : []
    },
    read: async (p: string) => files[p] ?? Promise.reject(new Error('no')),
  }
  const r = await resolveRefs(fs, 'c', ['RV-001'], 'look at RV-1 in TICKET-123')
  expect(r[0]?.file).toBe('c/features/TICKET-123/review/review.md')
})

test('findIds: lettered numbers Q-L1, Q-P21; D-26 is normalised', () => {
  expect(findIds('| D-26 | ... |, Q-L1 / D-27, Q-L2 and Q-P21')).toEqual(['D-026', 'Q-L1', 'D-027', 'Q-L2', 'Q-P21'])
})

test('resolveRefs: flat docs/*.md near cwd, a table row beats a mention in a list', async () => {
  const files: Record<string, string> = {
    '/p/docs/decisions.md': '| ID | Decision |\n|---|---|\n| D-26 | ~~Core~~ | rejected → D-32 |',
    '/p/docs/40-open-questions.md': '| Q-L1 | ~~Module prefix~~ | closed → D-04 |',
    '/p/docs/60-session-log.md': '- Decisions: D-26, D-27 rejected\n- Questions: Q-L1 closed',
  }
  const fs = {
    // session-log comes first in the listing: the definition must still win over the mention
    list: async (p?: string) =>
      p === '/p/docs'
        ? ['60-session-log.md', 'decisions.md', '40-open-questions.md'].map(name => ({ name, kind: 'file' as const, mtimeMs: 1 }))
        : [],
    read: async (p: string) => files[p] ?? Promise.reject(new Error('no')),
  }
  const r = await resolveRefs(fs, '/p/sub', ['D-026', 'Q-L1'], '')
  expect(r.map(x => x.file)).toEqual(['/p/docs/decisions.md', '/p/docs/40-open-questions.md'])
  expect(r[0]?.text.startsWith('| D-26 |')).toBe(true)
})

test('rootsIn: docs with spaces and Cyrillic in the path; two paths on a line are not glued together', () => {
  expect(rootsIn('see D:\\work\\My Проект\\docs\\decisions.md and E:/x/docs, `F:/y/features`')).toEqual([
    'D:/work/My Проект/docs',
    'E:/x/docs',
    'F:/y/features',
  ])
})

test('resolveRefs: docs from a path in the text works without cwd', async () => {
  const files: Record<string, string> = { 'D:/p/docs/decisions.md': '| D-26 | Core | rejected |' }
  const fs = {
    list: async (p?: string) => (p === 'D:/p/docs' ? [{ name: 'decisions.md', kind: 'file' as const, mtimeMs: 1 }] : []),
    read: async (p: string) => files[p] ?? Promise.reject(new Error('no')),
  }
  const r = await resolveRefs(fs, undefined, ['D-026'], 'see D-26 in D:\\p\\docs\\decisions.md')
  expect(r[0]?.file).toBe('D:/p/docs/decisions.md')
})

test('parsePrefixes: comma-separated list, default directory is the lowercase prefix, junk is dropped', () => {
  expect(parsePrefixes('RV=review, jira=x; ADR\nPROJECT=y, ab=z, BUG=bugs')).toEqual({ RV: 'review', ADR: 'adr', BUG: 'bugs' })
  expect(parsePrefixes('')).toEqual({})
})

test('resolveRefs: custom prefixes replace the default set', async () => {
  const files: Record<string, string> = { 'c/features/X-1/bugs/b.md': '### BUG-001 — failure\ntext' }
  const fs = {
    list: async (p?: string) =>
      p === 'c/features'
        ? [{ name: 'X-1', kind: 'dir' as const, mtimeMs: 1 }]
        : p === 'c/features/X-1/bugs'
          ? [{ name: 'b.md', kind: 'file' as const, mtimeMs: 1 }]
          : [],
    read: async (p: string) => files[p] ?? Promise.reject(new Error('no file')),
  }
  expect(await resolveRefs(fs, 'c', ['BUG-001'], '')).toEqual([])
  const r = await resolveRefs(fs, 'c', ['BUG-001'], '', [], { BUG: 'bugs' })
  expect(r[0]?.file).toBe('c/features/X-1/bugs/b.md')
})

test('findIds and extractSection: custom prefixes with >4 characters (e.g. TICKET, STORY)', () => {
  const ids = findIds('Found TICKET-123 and STORY-42', { TICKET: 'tickets', STORY: 'stories' })
  expect(ids).toEqual(['TICKET-123', 'STORY-042'])

  const md = '# Tickets\n\n### TICKET-123: Important bug\nDetails of the ticket.\n\n### TICKET-124: Other'
  const section = extractSection(md, 'TICKET-123')
  expect(section).toBeDefined()
  expect(section?.text.includes('Important bug')).toBe(true)
})

test('discoverRefs caps discovered items at 30 and handles missing files gracefully', async () => {
  const mockFs = {
    list: async (dir?: string) => {
      if (dir?.endsWith('/docs')) {
        return [{ name: 'many.md', kind: 'file' as const, mtimeMs: 1000 }]
      }
      return []
    },
    read: async () => {
      // 50 IDs: RV-1 to RV-50
      return Array.from({ length: 50 }, (_, i) => `### RV-${i + 1}: Item ${i + 1}`).join('\n')
    },
  }
  const discovered = (await discoverRefs(mockFs, '/workspace', [], HOME)).map(r => r.id)
  expect(discovered.length).toBe(30)
  expect(discovered[0]).toBe('RV-001')
  expect(discovered[29]).toBe('RV-030')
})

test('discoverRefs resolves items directly and sorts features tickets by recency', async () => {
  const mockFs = {
    list: async (dir?: string) => {
      const p = String(dir ?? '')
      if (p === '/workspace/features') {
        return [
          { name: 'OLD-1', kind: 'dir' as const, mtimeMs: 100 },
          { name: 'NEW-2', kind: 'dir' as const, mtimeMs: 5000 },
          { name: 'ignore.txt', kind: 'file' as const, mtimeMs: 2000 },
        ]
      }
      if (p === '/workspace/features/NEW-2') {
        return [
          { name: 'review', kind: 'dir' as const, mtimeMs: 5000 },
          { name: 'other_folder', kind: 'dir' as const, mtimeMs: 5000 },
        ]
      }
      if (p === '/workspace/features/NEW-2/review') {
        return [{ name: 'review.md', kind: 'file' as const, mtimeMs: 5000 }]
      }
      if (p === '/workspace/features/OLD-1') {
        return [{ name: 'review', kind: 'dir' as const, mtimeMs: 100 }]
      }
      if (p === '/workspace/features/OLD-1/review') {
        return [{ name: 'old_review.md', kind: 'file' as const, mtimeMs: 100 }]
      }
      return []
    },
    read: async (file: string) => {
      if (file.includes('NEW-2')) {
        return '# Review\n\n### RV-10: Fresh review finding\nDetails on fresh issue.'
      }
      if (file.includes('OLD-1')) {
        return '# Review\n\n### RV-1: Ancient review finding\nDetails on ancient issue.'
      }
      return ''
    },
  }

  const refs = await discoverRefs(mockFs, '/workspace', [], HOME)
  expect(refs.length).toBe(2)
  // NEW-2 (mtimeMs 5000) should be visited before OLD-1 (mtimeMs 100)
  expect(refs[0]!.id).toBe('RV-010')
  expect(refs[0]!.file).toBe('/workspace/features/NEW-2/review/review.md')
  expect(refs[0]!.line).toBe(3)
  expect(refs[0]!.text).toContain('Fresh review finding')

  expect(refs[1]!.id).toBe('RV-001')
  expect(refs[1]!.file).toBe('/workspace/features/OLD-1/review/old_review.md')
})
