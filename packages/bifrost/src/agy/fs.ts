/** `FsLike` over `node:fs`, for the agy server. Never throws: a missing folder lists empty. */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FsEntry, FsLike } from '../core/fs'

export const nodeFs: FsLike = {
  async list(dir = '.') {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      return await Promise.all(
        entries.map(async (e): Promise<FsEntry> => {
          const st = await stat(join(dir, e.name)).catch(() => undefined)
          return { name: e.name, kind: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other', mtimeMs: st?.mtimeMs ?? 0 }
        }),
      )
    } catch {
      return []
    }
  },
  read: path => readFile(path, 'utf8'),
}
