import assert from 'node:assert/strict'
import test from 'node:test'
import { checkIsMain, createSidecarServer, getPreloadJs } from '../server/sidecar-server.mjs'

test('getPreloadJs: returns non-empty preload script', () => {
  const js = getPreloadJs()
  assert.ok(typeof js === 'string' && js.length > 50)
  assert.ok(js.includes('window.sidecar'))
})

test('createSidecarServer: serves /preload.js without token', async () => {
  const { server, start } = createSidecarServer({
    token: 'secret123',
  })
  const { port } = await start()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/preload.js`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('window.sidecar'))
  } finally {
    server.close()
  }
})

test('createSidecarServer: enforces token on protected routes', async () => {
  const { server, start } = createSidecarServer({
    token: 'secret123',
    uiHtml: '<h1>Protected</h1>',
  })
  const { port } = await start()
  try {
    // 1. Without token: 401
    const resUnauthorized = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(resUnauthorized.status, 401)

    // 2. With header token: 200
    const resHeader = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'X-Sidecar-Token': 'secret123' },
    })
    assert.equal(resHeader.status, 200)
    assert.ok((await resHeader.text()).includes('Protected'))

    // 3. With query token: 200
    const resQuery = await fetch(`http://127.0.0.1:${port}/?token=secret123`)
    assert.equal(resQuery.status, 200)
  } finally {
    server.close()
  }
})

test('checkIsMain: compares paths reliably', () => {
  const metaUrl = import.meta.url
  assert.equal(checkIsMain(metaUrl, ''), false)
})
