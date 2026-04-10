import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function getBookmarkDir(address: string): string {
  return join(tmpdir(), `string-agent-${address.toLowerCase()}`)
}

function getBookmarkPath(address: string): string {
  return join(getBookmarkDir(address), 'last-block')
}

export function loadBookmark(address: string): bigint | null {
  const path = getBookmarkPath(address)
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf-8').trim()
    return BigInt(raw)
  } catch {
    return null
  }
}

export function saveBookmark(address: string, blockNumber: bigint): void {
  const dir = getBookmarkDir(address)
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(getBookmarkPath(address), blockNumber.toString())
  } catch (err) {
    process.stderr.write(`string: failed to save bookmark: ${err}\n`)
  }
}
