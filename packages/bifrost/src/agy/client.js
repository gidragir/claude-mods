// Bifrost page runtime for the agy webview. The server renders; this file only shows the HTML,
// posts events back (by data-bf-id) and carries out effects. No framework, no build step.
;(() => {
  const root = document.getElementById('bf-root')
  if (!root) return
  const pane = root.dataset.pane
  const token = new URLSearchParams(location.search).get('token')
  let workspaceUris = []
  let version = -1
  let selection = ''
  let inflight = 0

  const headers = () => {
    const h = { 'Content-Type': 'application/json' }
    if (token) h['X-Sidecar-Token'] = token
    return h
  }

  // cells across the pane, measured with the page's own font
  const probe = document.createElement('span')
  probe.textContent = 'x'.repeat(100)
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'
  document.body.appendChild(probe)
  const columns = () => Math.max(20, Math.floor(root.clientWidth / Math.max(1, probe.getBoundingClientRect().width / 100)))

  async function post(path, body) {
    inflight++
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ pane, columns: columns(), workspaceUris, selection, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (typeof data.version === 'number') version = data.version
      patch(data.html)
      for (const e of data.effects || []) run(e)
    } catch (err) {
      toast(`Error: ${err.message || err}`)
    } finally {
      inflight--
    }
  }

  // Swap the HTML, keeping the focused field (by key), its caret and the scroll position.
  function patch(html) {
    const active = document.activeElement
    const key = active?.dataset?.bfKey
    const caret = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd, active.value] : null
    const scroll = document.scrollingElement?.scrollTop ?? 0
    root.innerHTML = html
    if (key) {
      const again = root.querySelector(`[data-bf-key="${CSS.escape(key)}"]`)
      if (again) {
        // typed ahead of the server (input is debounced): the page's text wins until it is submitted
        if (caret && active.dataset.dirty && again.value !== caret[2]) {
          again.value = caret[2]
          again.dataset.dirty = '1'
        }
        again.focus()
        if (caret) again.setSelectionRange(caret[0], caret[1])
      }
    }
    if (document.scrollingElement) document.scrollingElement.scrollTop = scroll
  }

  const send = (el, kind, value) => post('/_bf/event', { id: el.dataset.bfId, kind, value })

  function run(e) {
    if (e.type === 'toast') toast(e.message)
    else if (e.type === 'prompt') toChat(e.text)
    else if (e.type === 'submit') submit(e.text)
    else if (e.type === 'focus') root.querySelector(`[data-bf-key="${CSS.escape(e.key)}"]`)?.focus()
  }

  // Into the chat prompt: the host's two messages, then the clipboard as a fallback.
  async function toChat(text) {
    try {
      window.parent.postMessage({ type: 'add-chat-context', payload: { text } }, '*')
      window.parent.postMessage({ type: 'insert-prompt', payload: { text } }, '*')
    } catch {}
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  async function submit(text) {
    try {
      if (window.sidecar?.agent?.sendMessage) return await window.sidecar.agent.sendMessage(text)
    } catch {}
    await toChat(text)
  }

  function toast(message) {
    const el = document.createElement('div')
    el.className = 'bf-toast'
    el.textContent = message
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  }

  // the selection is read before the press collapses it
  document.addEventListener('pointerdown', ev => {
    if (ev.target.closest?.('button[data-bf-id]')) selection = String(window.getSelection() || '')
  })
  root.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-bf-id]')
    if (!btn) return
    send(btn, 'press').finally(() => {
      selection = ''
    })
  })

  const timers = new WeakMap()
  root.addEventListener('input', ev => {
    const el = ev.target
    if (!el.matches?.('[data-bf-id].bf-input')) return
    el.dataset.dirty = '1'
    clearTimeout(timers.get(el))
    timers.set(
      el,
      setTimeout(() => send(el, 'input', el.value), 250),
    )
  })
  root.addEventListener('keydown', ev => {
    const el = ev.target
    if (!el.matches?.('[data-bf-id].bf-input')) return
    const multiline = el.tagName === 'TEXTAREA'
    if (ev.key === 'Enter' && (!multiline || ev.ctrlKey || ev.metaKey) && !ev.isComposing) {
      ev.preventDefault()
      clearTimeout(timers.get(el))
      delete el.dataset.dirty
      send(el, 'submit', el.value)
    }
  })
  root.addEventListener('change', ev => {
    if (ev.target.matches?.('select[data-bf-id]')) send(ev.target, 'select', ev.target.value)
  })

  // a Button's hotkey works while no field has the keyboard
  document.addEventListener('keydown', ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('input, textarea, select')) return
    const btn = root.querySelector(`button[data-bf-hotkey="${CSS.escape(ev.key)}"]`)
    if (btn) {
      ev.preventDefault()
      btn.click()
    }
  })

  let resizeTimer
  new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => post('/_bf/render', {}), 200)
  }).observe(root)

  // live updates: state changed by someone else (another request, a timer)
  const stream = new EventSource(`/_bf/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`)
  stream.addEventListener('change', ev => {
    if (inflight === 0 && Number(ev.data) > version) post('/_bf/render', {})
  })
  stream.addEventListener('hello', ev => {
    // a restarted server (dev rebuild) starts over at version 0
    if (Number(ev.data) < version) post('/_bf/render', { initial: true })
  })

  const start = uris => {
    workspaceUris = Array.isArray(uris) ? uris : []
    post('/_bf/render', { initial: true })
  }
  if (window.sidecar?.getWorkspaceUris) {
    window.sidecar.getWorkspaceUris().then(start, () => start([]))
    window.sidecar.onWorkspaceChange?.(uris => {
      workspaceUris = uris
      post('/_bf/render', {})
    })
  } else start([])
})()
