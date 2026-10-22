/**
 * Client helper for Antigravity Webview Auxiliary Pane.
 * Handles theme synchronization, workspace lifecycle, API requests, and chat quoting.
 */

declare global {
  interface Window {
    sidecar?: {
      conversationId?: string
      fetch: (url: string, opts?: RequestInit) => Promise<Response>
      getWorkspaceUris: () => Promise<string[]>
      onWorkspaceChange: (listener: (uris: string[]) => void) => () => void
      agent?: {
        sendMessage: (msg: { text: string; conversationId?: string }) => Promise<void>
      }
    }
  }
}

export interface SidecarClientOptions {
  onWorkspaceChange?: (uris: string[]) => void
  onThemeChange?: (vars: Record<string, string>) => void
}

export function initSidecarClient({ onWorkspaceChange, onThemeChange }: SidecarClientOptions = {}) {
  // 1. Sync theme variables from window message
  if (typeof window !== 'undefined') {
    window.addEventListener('message', event => {
      if (event.data?.type === 'theme-change') {
        const vars = event.data.payload?.cssVariables || {}
        for (const [key, value] of Object.entries(vars)) {
          document.documentElement.style.setProperty(key, value as string)
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
  }

  // 3. API helper
  async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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
    quoteToChat: (text: string, conversationId?: string) => quoteToChat(text, conversationId),
  }
}

export const createWebviewClient = initSidecarClient

/**
 * Quotes text or selection into active Antigravity chat prompt.
 * Emits dual window.parent.postMessage, attempts agent.sendMessage, and falls back to clipboard.
 */
export async function quoteToChat(text: string, conversationId?: string): Promise<boolean> {
  if (!text) return false

  let handled = false

  // 1. Dual postMessage events to parent window
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

  // 2. Window sidecar agent direct invocation
  try {
    if (typeof window !== 'undefined' && window.sidecar?.agent?.sendMessage) {
      await window.sidecar.agent.sendMessage({ text, conversationId })
      handled = true
    }
  } catch (e) {
    console.debug('Sidecar agent sendMessage failed:', e)
  }

  // 3. Fallback: Copy to clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    }
  } catch (e) {
    console.debug('Clipboard writeText failed:', e)
  }

  return handled
}
