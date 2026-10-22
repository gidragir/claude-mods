import assert from 'node:assert/strict'
import test from 'node:test'
import { checkIsMain, createSidecarHandler, startServer } from '../server.mjs'

test('Antigravity Sidecar Server', async t => {
  const { server, port } = await startServer(0)

  t.after(() => {
    server.close()
  })

  const baseUrl = `http://127.0.0.1:${port}`

  await t.test('serves preload.js without authentication', async () => {
    const res = await fetch(`${baseUrl}/preload.js`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /javascript/)
    const text = await res.text()
    assert.ok(text.includes('window.sidecar'))
  })

  await t.test('serves index.html UI', async () => {
    const res = await fetch(`${baseUrl}/`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /html/)
    const text = await res.text()
    assert.ok(text.includes('Refs Pane'))
    assert.ok(text.includes('search-bar'))
  })

  await t.test('resolves actual refs from workspace docs/*.md via /api/refs', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { pathToFileURL } = await import('node:url')

    const tempDir = await mkdtemp(join(tmpdir(), 'sidecar-test-'))
    const docsDir = join(tempDir, 'docs')
    await mkdir(docsDir, { recursive: true })
    await writeFile(
      join(docsDir, 'review.md'),
      '# Code Review\n\n## RV-1 Memory leak in cache\nFix uncollected cache keys in long-running processes.\n\n## RV-2 Unhandled promise\nEnsure all promises are caught.',
    )

    try {
      // 1. Resolve specific reference with file:// URI
      const resUri = await fetch(`${baseUrl}/api/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Please check finding RV-1',
          workspaceUris: [pathToFileURL(tempDir).href],
        }),
      })
      assert.equal(resUri.status, 200)
      const dataUri = await resUri.json()
      assert.equal(dataUri.refs.length, 1)
      assert.equal(dataUri.refs[0].id, 'RV-001')
      assert.equal(dataUri.refs[0].line, 3)
      assert.ok(dataUri.refs[0].text.includes('Memory leak in cache'))
      assert.ok(dataUri.refs[0].html.includes('<p>Fix uncollected cache keys in long-running processes.</p>'))
      assert.ok(dataUri.refs[0].file.endsWith('review.md'))

      // 2. Resolve with plain filesystem path
      const resPlain = await fetch(`${baseUrl}/api/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'RV-2',
          workspaceUris: [tempDir],
        }),
      })
      assert.equal(resPlain.status, 200)
      const dataPlain = await resPlain.json()
      assert.equal(dataPlain.refs.length, 1)
      assert.equal(dataPlain.refs[0].id, 'RV-002')
      assert.ok(dataPlain.refs[0].text.includes('Unhandled promise'))

      // 3. Auto-discover all refs when query is empty
      const resAuto = await fetch(`${baseUrl}/api/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '',
          workspaceUris: [tempDir],
        }),
      })
      assert.equal(resAuto.status, 200)
      const dataAuto = await resAuto.json()
      assert.equal(dataAuto.refs.length, 2)
      const ids = dataAuto.refs.map(r => r.id).sort()
      assert.deepEqual(ids, ['RV-001', 'RV-002'])

      // 4. Custom prefixes resolution
      await writeFile(join(docsDir, 'security.md'), '# Security\n\n## SEC-1 Vulnerability in parser\nEscape all user inputs.')
      const resCustom = await fetch(`${baseUrl}/api/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'SEC-1',
          prefixes: 'SEC=docs',
          workspaceUris: [tempDir],
        }),
      })
      assert.equal(resCustom.status, 200)
      const dataCustom = await resCustom.json()
      assert.equal(dataCustom.refs.length, 1)
      assert.equal(dataCustom.refs[0].id, 'SEC-001')
      assert.ok(dataCustom.refs[0].text.includes('Vulnerability in parser'))
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  await t.test('enforces token authentication when configured', async () => {
    const secureHandler = createSidecarHandler({ token: 'test-secure-token' })
    const { createServer } = await import('node:http')
    const secureServer = createServer(secureHandler)

    await new Promise(resolve => secureServer.listen(0, '127.0.0.1', resolve))
    const secPort = secureServer.address().port

    try {
      // Unauthenticated request
      const unauthorizedRes = await fetch(`http://127.0.0.1:${secPort}/api/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'RV-1' }),
      })
      assert.equal(unauthorizedRes.status, 401)

      // Authenticated with header
      const authHeaderRes = await fetch(`http://127.0.0.1:${secPort}/api/refs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sidecar-Token': 'test-secure-token',
        },
        body: JSON.stringify({ query: 'RV-1' }),
      })
      assert.equal(authHeaderRes.status, 200)

      // Authenticated with query param
      const authQueryRes = await fetch(`http://127.0.0.1:${secPort}/api/refs?token=test-secure-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'RV-1' }),
      })
      assert.equal(authQueryRes.status, 200)
    } finally {
      secureServer.close()
    }
  })

  await t.test('checkIsMain matches paths across Windows drive casing differences and junctions', () => {
    const originalPort = process.env.ANTIGRAVITY_SIDECAR_WEB_PORT
    try {
      delete process.env.ANTIGRAVITY_SIDECAR_WEB_PORT
      const metaUrl = 'file:///D:/personal/claude-mods/plugins/ref-pane/sidecars/ref-pane/server.mjs'

      // 1. Lowercase vs uppercase drive letter
      assert.ok(checkIsMain('d:/personal/claude-mods/plugins/ref-pane/sidecars/ref-pane/server.mjs', metaUrl))
      assert.ok(checkIsMain('D:/personal/claude-mods/plugins/ref-pane/sidecars/ref-pane/server.mjs', metaUrl))

      // 2. Unrelated file returns false
      assert.equal(checkIsMain('d:/personal/claude-mods/scripts/check.mjs', metaUrl), false)
      assert.equal(checkIsMain('', metaUrl), false)
    } finally {
      if (originalPort !== undefined) process.env.ANTIGRAVITY_SIDECAR_WEB_PORT = originalPort
    }
  })
})
