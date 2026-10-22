// src/ui/web/client.ts
function initSidecarClient({ onWorkspaceChange, onThemeChange } = {}) {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', event => {
      if (event.data?.type === 'theme-change') {
        const vars = event.data.payload?.cssVariables || {}
        for (const [key, value] of Object.entries(vars)) {
          document.documentElement.style.setProperty(key, value)
        }
        if (typeof onThemeChange === 'function') onThemeChange(vars)
      }
    })
    if (window.sidecar && typeof onWorkspaceChange === 'function') {
      window.sidecar.onWorkspaceChange(uris => {
        onWorkspaceChange(uris)
      })
      window.sidecar.getWorkspaceUris().then(uris => {
        if (uris && uris.length > 0) onWorkspaceChange(uris)
      })
    }
  }
  async function api(path, options = {}) {
    const fetcher =
      typeof window !== 'undefined' && window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch.bind(globalThis)
    const res = await fetcher(path, options)
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`)
    }
    return res.json()
  }
  return {
    api,
    getWorkspaceUris: () =>
      typeof window !== 'undefined' && window.sidecar?.getWorkspaceUris ? window.sidecar.getWorkspaceUris() : Promise.resolve([]),
    quoteToChat: (text, conversationId) => quoteToChat(text, conversationId),
  }
}
var createWebviewClient = initSidecarClient
async function quoteToChat(text, conversationId) {
  if (!text) return false
  let handled = false
  try {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage(
        {
          type: 'add-chat-context',
          payload: { text, conversationId },
        },
        '*',
      )
      window.parent.postMessage(
        {
          type: 'insert-prompt',
          payload: { text, conversationId },
        },
        '*',
      )
      handled = true
    }
  } catch (e) {
    console.debug('Parent postMessage failed:', e)
  }
  try {
    if (typeof window !== 'undefined' && window.sidecar?.agent?.sendMessage) {
      await window.sidecar.agent.sendMessage({ text, conversationId })
      handled = true
    }
  } catch (e) {
    console.debug('Sidecar agent sendMessage failed:', e)
  }
  try {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    }
  } catch (e) {
    console.debug('Clipboard writeText failed:', e)
  }
  return handled
}

export { createWebviewClient, initSidecarClient, quoteToChat }
