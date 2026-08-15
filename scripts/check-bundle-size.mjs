import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const assets = join(process.cwd(), 'dist', 'assets')
const MAX_GZIP_BYTES = 260 * 1024
const entries = await readdir(assets)
const javascript = entries.filter((name) => name.endsWith('.js'))

let failed = false
for (const name of javascript) {
  const payload = await readFile(join(assets, name))
  const gzipBytes = gzipSync(payload).byteLength
  console.log(`${name}: ${(gzipBytes / 1024).toFixed(1)} KiB gzip`)
  if (gzipBytes > MAX_GZIP_BYTES) {
    console.error(`${name} exceeds ${(MAX_GZIP_BYTES / 1024).toFixed(0)} KiB gzip budget`)
    failed = true
  }
}

if (failed) process.exit(1)
