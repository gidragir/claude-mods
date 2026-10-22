import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkIsMain, createSidecarApp, getPreloadJs, sendJson } from '../dist/server.js'

test('getPreloadJs returns valid fallback or sdk preload script', () => {
  const code = getPreloadJs()
  assert.ok(typeof code === 'string')
  assert.ok(code.includes('window.sidecar'))
  assert.ok(code.includes('theme-change'))
})

test('checkIsMain compares import.meta.url and process.argv[1]', () => {
  const metaUrl = 'file:///D:/test/server.mjs'
  assert.equal(checkIsMain(metaUrl, 'd:\\test\\server.mjs'), true)
  assert.equal(checkIsMain(metaUrl, 'd:\\other\\server.mjs'), false)
  assert.equal(checkIsMain(metaUrl, undefined), false)
})

test('createSidecarApp serves preload.js without authentication', async () => {
  const app = createSidecarApp({
    name: 'test-sidecar',
    token: 'secret-token-123',
  })

  const { port } = await app.start()

  try {
    const res = await fetch(`http://127.0.0.1:${port}/preload.js`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('window.sidecar'))
  } finally {
    await app.stop()
  }
})

test('createSidecarApp enforces token on protected routes', async () => {
  const app = createSidecarApp({
    name: 'test-sidecar',
    token: 'secret-token-123',
    uiHtml: '<h1>Protected App</h1>',
    routes: {
      '/api/data': (_req, res) => {
        sendJson(res, { secret: 'data' })
      },
    },
  })

  const { port } = await app.start()

  try {
    // 1. Without token -> 401
    const unauth = await fetch(`http://127.0.0.1:${port}/api/data`)
    assert.equal(unauth.status, 401)

    // 2. With header token -> 200
    const authHeader = await fetch(`http://127.0.0.1:${port}/api/data`, {
      headers: { 'X-Sidecar-Token': 'secret-token-123' },
    })
    assert.equal(authHeader.status, 200)
    const json1 = await authHeader.json()
    assert.deepEqual(json1, { secret: 'data' })

    // 3. With query param token -> 200
    const authQuery = await fetch(`http://127.0.0.1:${port}/api/data?token=secret-token-123`)
    assert.equal(authQuery.status, 200)

    // 4. Root UI with token -> 200
    const ui = await fetch(`http://127.0.0.1:${port}/?token=secret-token-123`)
    assert.equal(ui.status, 200)
    const html = await ui.text()
    assert.ok(html.includes('Protected App'))

    // 5. Shared web assets: /pico.css and /client.js
    const picoRes = await fetch(`http://127.0.0.1:${port}/pico.css?token=secret-token-123`)
    assert.equal(picoRes.status, 200)
    assert.match(picoRes.headers.get('content-type') || '', /text\/css/)

    const clientRes = await fetch(`http://127.0.0.1:${port}/client.js?token=secret-token-123`)
    assert.equal(clientRes.status, 200)
    assert.match(clientRes.headers.get('content-type') || '', /javascript/)
  } finally {
    await app.stop()
  }
})

test('checkIsMain handles non-file URL inputs gracefully', () => {
  assert.equal(checkIsMain('d:/some/path.mjs', 'd:/some/path.mjs'), true)
  assert.equal(checkIsMain('d:/some/path.mjs', 'd:/other/path.mjs'), false)
})
