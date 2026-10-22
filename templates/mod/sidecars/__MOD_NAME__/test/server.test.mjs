import assert from 'node:assert/strict'
import test from 'node:test'
import { server, start } from '../server.mjs'

test('__MOD_NAME__ sidecar server: serves UI and /api/status', async () => {
  const { port } = await start()
  try {
    const resUi = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(resUi.status, 200)

    const resApi = await fetch(`http://127.0.0.1:${port}/api/status`)
    assert.equal(resApi.status, 200)
    const json = await resApi.json()
    assert.equal(json.status, 'ok')
    assert.equal(json.mod, '__MOD_NAME__')
  } finally {
    server.close()
  }
})
