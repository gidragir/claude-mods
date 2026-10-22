import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateManifests, loadModConfig } from '../dist/cli.js'

test('loadModConfig and generateManifests generate expected plugin manifests', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bifrost-test-'))

  try {
    const configContent = `
export default {
  name: 'sample-mod',
  displayName: 'Sample Mod',
  version: '0.2.0',
  description: 'Test mod description',
  sidecar: {
    enabled: true,
    title: 'Sample UI',
  },
}
`
    writeFileSync(join(tmp, 'mod.config.js'), configContent)

    const config = await loadModConfig(tmp)
    assert.ok(config)
    assert.equal(config.name, 'sample-mod')

    await generateManifests(tmp, config)

    // Verify .claude-plugin/plugin.json
    const claudeJsonPath = join(tmp, '.claude-plugin', 'plugin.json')
    assert.ok(existsSync(claudeJsonPath))
    const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf8'))
    assert.equal(claudeJson.name, 'sample-mod')
    assert.equal(claudeJson.version, '0.2.0')

    // Verify hooks/hooks.json
    const hooksJsonPath = join(tmp, 'hooks', 'hooks.json')
    assert.ok(existsSync(hooksJsonPath))

    // Verify Antigravity plugin.json
    const agyJsonPath = join(tmp, 'plugin.json')
    assert.ok(existsSync(agyJsonPath))
    const agyJson = JSON.parse(readFileSync(agyJsonPath, 'utf8'))
    assert.equal(agyJson.displayName, 'Sample Mod')

    // Verify sidecars/sample-mod/sidecar.json
    const sidecarJsonPath = join(tmp, 'sidecars', 'sample-mod', 'sidecar.json')
    assert.ok(existsSync(sidecarJsonPath))
    const sidecarJson = JSON.parse(readFileSync(sidecarJsonPath, 'utf8'))
    assert.equal(sidecarJson.ui_config.views[0].title, 'Sample UI')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
