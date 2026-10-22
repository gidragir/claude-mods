/**
 * Lightweight client helper for Antigravity Webview Auxiliary Pane.
 * Handles theme synchronization and workspace lifecycle.
 */

export function initSidecarClient({ onWorkspaceChange, onThemeChange } = {}) {
  // 1. Sync theme variables from window message
  window.addEventListener('message', event => {
    if (event.data?.type === 'theme-change') {
      const vars = event.data.payload?.cssVariables || {}
      for (const [key, value] of Object.entries(vars)) {
        document.documentElement.style.setProperty(key, value)
      }
      if (typeof onThemeChange === 'function') onThemeChange(vars)
    }
  })

  // 2. Workspace updates
  if (window.sidecar && typeof onWorkspaceChange === 'function') {
    window.sidecar.onWorkspaceChange(uris => {
      onWorkspaceChange(uris)
    })
    window.sidecar.getWorkspaceUris().then(uris => {
      if (uris && uris.length > 0) onWorkspaceChange(uris)
    })
  }

  // 3. API helper
  async function api(path, options = {}) {
    const fetcher = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : window.fetch.bind(window)
    const res = await fetcher(path, options)
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`)
    }
    return res.json()
  }

  return {
    api,
    getWorkspaceUris: () => (window.sidecar?.getWorkspaceUris ? window.sidecar.getWorkspaceUris() : Promise.resolve([])),
  }
}
