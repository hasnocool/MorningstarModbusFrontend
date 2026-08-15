import { execFileSync } from 'node:child_process'

const source = process.env.OPENAPI_URL || 'http://127.0.0.1:8080/openapi.json'
execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['openapi-typescript', source, '-o', 'src/api/generated.d.ts'],
  { stdio: 'inherit' },
)
