/**
 * File system abstraction and safe single-pass traversal utilities.
 * Pure core: zero runtime dependencies, no direct Node or DOM globals.
 */

export interface FsEntry {
  name: string
  kind: 'file' | 'dir' | 'other'
  mtimeMs?: number
}

export interface FsStat {
  mtimeMs?: number
  isFile?: boolean
  isDirectory?: boolean
  size?: number
}

export interface FsLike {
  list(path?: string): Promise<FsEntry[]>
  read(path: string): Promise<string>
  write?(path: string, content: string): Promise<void>
  stat?(path: string): Promise<FsStat>
}

/**
 * Safely lists directory contents without throwing. Returns empty array on error.
 */
export async function safeList(fs: FsLike, dir?: string): Promise<FsEntry[]> {
  try {
    return await fs.list(dir)
  } catch {
    return []
  }
}

/**
 * Safely reads file contents without throwing. Returns empty string on error.
 */
export async function safeRead(fs: FsLike, path: string): Promise<string> {
  try {
    return await fs.read(path)
  } catch {
    return ''
  }
}

/**
 * Performs a single-pass search for matching files in a directory.
 */
export async function findFiles(
  fs: FsLike,
  dir: string,
  filter: (entry: FsEntry) => boolean = e => e.kind === 'file',
  limit = 50,
): Promise<string[]> {
  const entries = await safeList(fs, dir)
  const results: string[] = []
  for (const entry of entries) {
    if (filter(entry)) {
      results.push(`${dir}/${entry.name}`)
      if (results.length >= limit) break
    }
  }
  return results
}

/**
 * Caps a list of items sorted by modification timestamp descending.
 */
export function boundTraversalByRecency<T>(items: T[], getMtimeMs: (item: T) => number, limit = 10): T[] {
  return [...items].sort((a, b) => getMtimeMs(b) - getMtimeMs(a)).slice(0, limit)
}
