/**
 * `/preload.js`: Antigravity's own `sidecar_sdk/preload.js` when installed, else a minimal stand-in
 * exposing the same `window.sidecar` surface the client runtime uses.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FALLBACK = `(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  var uris = [];
  var listeners = new Set();
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'theme-change') {
      var vars = (data.payload && data.payload.cssVariables) || {};
      for (var key in vars) document.documentElement.style.setProperty(key, vars[key]);
    } else if (data.type === 'workspace-change') {
      uris = Array.isArray(data.payload && data.payload.workspaceUris) ? data.payload.workspaceUris.slice() : [];
      listeners.forEach(function (l) { try { l(uris.slice()); } catch (e) { console.error(e); } });
    }
  });
  window.sidecar = {
    conversationId: params.get('conversationId'),
    fetch: function (url, opts) {
      opts = opts || {};
      var headers = new Headers(opts.headers || {});
      if (token) headers.set('X-Sidecar-Token', token);
      return fetch(url, Object.assign({}, opts, { headers: headers }));
    },
    getWorkspaceUris: function () { return Promise.resolve(uris.slice()); },
    onWorkspaceChange: function (l) {
      if (typeof l !== 'function') return function () {};
      listeners.add(l);
      if (uris.length > 0) queueMicrotask(function () { l(uris.slice()); });
      return function () { listeners.delete(l); };
    }
  };
})();
`

export function preloadJs(home = homedir()): string {
  for (const p of [
    join(home, '.gemini', 'config', 'node_modules', 'sidecar_sdk', 'preload.js'),
    join(home, '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js'),
  ]) {
    try {
      if (existsSync(p)) return readFileSync(p, 'utf8')
    } catch {}
  }
  return FALLBACK
}
