// packages/bifrost/src/core/atom.ts
var KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
var registry = /* @__PURE__ */ new Map();
function atom(key, initial) {
  if (!KEY.test(key)) throw new Error(`bifrost: atom key "${key}" must match ${KEY}`);
  const known = registry.get(key);
  if (known) return known;
  const created = Object.freeze({ key, initial });
  registry.set(key, created);
  return created;
}
function declaredAtoms() {
  return [...registry.values()];
}
var applyUpdater = (prev, next) => typeof next === "function" ? next(prev) : next;
var MemoryStore = class {
  values = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  async get(a) {
    return this.peek(a);
  }
  peek(a) {
    return this.values.has(a.key) ? this.values.get(a.key) : a.initial;
  }
  async set(a, next) {
    const value = applyUpdater(this.peek(a), next);
    if (Object.is(value, this.values.get(a.key)) && this.values.has(a.key)) return;
    this.values.set(a.key, value);
    for (const l of this.listeners) l(a.key);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
};

// packages/bifrost/src/core/plugin.ts
var NAME = /^[a-z][a-z0-9-]{1,40}$/;
function definePlugin(spec) {
  if (!NAME.test(spec.name)) throw new Error(`bifrost: plugin name "${spec.name}" must be kebab-case (${NAME})`);
  for (const id of Object.keys(spec.panes ?? {})) if (!NAME.test(id)) throw new Error(`bifrost: pane id "${id}" must be kebab-case`);
  for (const id of Object.keys(spec.commands ?? {}))
    if (!/^[a-z][a-z0-9-:]*$/.test(id)) throw new Error(`bifrost: command "${id}" must be lowercase`);
  return Object.freeze({ ...spec, targets: spec.targets ?? ["claude", "agy"], atoms: declaredAtoms() });
}
var defaultPane = (plugin) => Object.keys(plugin.panes ?? {})[0];
var configValue = (raw) => {
  if (raw === void 0 || raw === null) return void 0;
  const s = String(raw).trim();
  return s === "" ? void 0 : s;
};

// packages/bifrost/src/core/vnode.ts
var make = (type) => (props) => {
  const { children, ...rest } = props;
  return { $$bf: true, type, props: rest, children: flatten(children) };
};
var Box = make("Box");
var Text = make("Text");
var Button = make("Button");
var Input = make("Input");
var Select = make("Select");
var Markdown = make("Markdown");
var Code = make("Code");
var Link = make("Link");
var isElement = (node) => typeof node === "object" && node !== null && node.$$bf === true;
function flatten(children) {
  const out = [];
  const walk = (n) => {
    if (n === null || n === void 0 || typeof n === "boolean") return;
    if (Array.isArray(n)) for (const c of n) walk(c);
    else out.push(n);
  };
  walk(children);
  return out;
}
function textOf(node) {
  if (node === null || node === void 0 || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const p = node.props;
  if (node.type === "Markdown") return p.text ?? "";
  if (node.type === "Code") return p.source ?? "";
  if ((node.type === "Button" || node.type === "Link") && p.label !== void 0 && node.children.length === 0) return p.label;
  return node.children.map(textOf).join("");
}

// packages/bifrost/src/core/render.ts
var current;
function frame(hook) {
  if (!current) throw new Error(`bifrost: ${hook}() is called outside a component render`);
  return current;
}
function useAtom(a) {
  const f = frame("useAtom");
  const host = f.host;
  if (!f.values.has(a.key)) f.missing.set(a.key, a);
  const value = f.values.has(a.key) ? f.values.get(a.key) : a.initial;
  return [value, (next) => host.set(a, next)];
}
var useValue = (a) => useAtom(a)[0];
var useHost = () => frame("useHost").host;
var useViewport = () => frame("useViewport").viewport;
var MAX_PASSES = 4;
async function renderComponent(component, { host, viewport: viewport2, known, label = "pane" }) {
  let tree = null;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const atoms = [...known.values()];
    const read = await Promise.all(atoms.map((a) => host.get(a)));
    const f = { host, viewport: viewport2, values: new Map(atoms.map((a, i) => [a.key, read[i]])), missing: /* @__PURE__ */ new Map() };
    const outer = current;
    current = f;
    try {
      tree = component();
    } catch (err) {
      return errorNotice(label, err);
    } finally {
      current = outer;
    }
    if (f.missing.size === 0) return tree;
    for (const [key, a] of f.missing) known.set(key, a);
  }
  return tree;
}
function errorNotice(label, err) {
  const message = err instanceof Error ? err.message : String(err);
  return Box({
    borderStyle: "round",
    borderColor: "red",
    paddingX: 1,
    flexDirection: "column",
    children: [Text({ color: "red", bold: true, children: `${label} failed` }), Text({ dimColor: true, children: message })]
  });
}

// packages/bifrost/src/jsx-runtime.ts
function jsx(type, props, key) {
  if (type === Fragment) return flatten(props.children);
  return type(key === void 0 ? props : { ...props, key: String(key) });
}
var jsxs = jsx;
function Fragment(props) {
  return flatten(props.children);
}

// packages/bifrost/src/ui/components.tsx
function Row({ key, gap = 1, align = "center", justify, wrap, marginBottom, children }) {
  return /* @__PURE__ */ jsx(
    Box,
    {
      flexDirection: "row",
      gap,
      alignItems: align,
      justifyContent: justify,
      flexWrap: wrap ? "wrap" : void 0,
      marginBottom,
      children
    },
    key
  );
}
function Column({ key, gap, align, justify, marginBottom, children }) {
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", gap, alignItems: align, justifyContent: justify, marginBottom, children }, key);
}
function Card({ key, selected = false, accent = "cyan", grow, children }) {
  return /* @__PURE__ */ jsx(
    Box,
    {
      kind: "card",
      borderStyle: "round",
      borderColor: selected ? accent : void 0,
      borderDimColor: !selected,
      paddingX: 1,
      flexDirection: "column",
      flexGrow: grow ? 1 : void 0,
      children
    },
    key
  );
}
function EmptyState({ message, hint, framed = false }) {
  const body = [/* @__PURE__ */ jsx(Text, { dimColor: true, children: message }), hint !== void 0 && hint !== "" ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: hint }) : null];
  return framed ? /* @__PURE__ */ jsx(Card, { children: body }) : /* @__PURE__ */ jsx(Column, { children: body });
}
function Field({ fallback = "This surface takes no input.", ...props }) {
  if (!useViewport().canInput) return fallback === "" ? null : /* @__PURE__ */ jsx(Text, { dimColor: true, children: fallback });
  return /* @__PURE__ */ jsx(Input, { ...props });
}

// plugins/quote-comments/src/comments.ts
var MAX_QUOTE = 2e3;
function preview(quote, max = 60) {
  const line = quote.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}\u2026` : line;
}
function quoteLines(quote) {
  const text = quote.trim();
  const cut = text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE)}\u2026` : text;
  return cut.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n");
}
function formatBlock(comments2) {
  const parts = comments2.map((c, i) => `**[${i + 1}]**
${quoteLines(c.quote)}

${c.note.trim()}`);
  return `Comments on fragments of the conversation:

${parts.join("\n\n")}`;
}
function appendComments(text, comments2) {
  if (comments2.length === 0) return text;
  const own = text.trimEnd();
  const block = formatBlock(comments2);
  return own === "" ? block : `${own}

${block}`;
}
function countLabel(n) {
  return n === 1 ? "1 comment" : `${n} comments`;
}

// plugins/quote-comments/src/store.ts
var PANE = "quote-comments";
var comments = atom("comments", []);
var draft = atom("draft", null);
var nextId = atom("nextId", 1);
var editing = atom("editing", null);
async function add(host, quote, ref, note) {
  const id = await host.get(nextId);
  await host.set(nextId, (n) => n + 1);
  await host.set(comments, (list) => [...list, { id, quote, ...ref === void 0 ? {} : { ref }, note: note.trim() }]);
}
async function clear(host) {
  await host.set(comments, []);
  await host.set(draft, null);
  await host.set(editing, null);
}
async function capture(host, note) {
  await host.set(editing, null);
  const selected = await host.selection();
  const text = note.trim();
  let kind;
  if (selected === void 0) {
    kind = "paste";
    await host.set(draft, { quote: "", ...text === "" ? {} : { note: text } });
  } else if (text !== "") {
    kind = "saved";
    await add(host, selected.text, selected.ref, text);
    await host.set(draft, null);
  } else {
    kind = "draft";
    await host.set(draft, { quote: selected.text, ...selected.ref === void 0 ? {} : { ref: selected.ref } });
  }
  const shown = await host.pane.open(PANE, { focus: true });
  return shown || kind === "saved" ? kind : "hidden";
}
async function sendAll(host) {
  const box = await host.prompt.read();
  const text = appendComments(box, await host.get(comments));
  if (text.trim() === "") return;
  await clear(host);
  if (box !== "") await host.prompt.replace("");
  await host.pane.close(PANE);
  await host.prompt.submit(text);
}

// plugins/quote-comments/src/ui.tsx
var NO_INPUT = "This surface takes no input: select the text in the terminal or desktop app.";
function DraftCard() {
  const host = useHost();
  const [pending, setPending] = useAtom(draft);
  const { columns } = useViewport();
  if (pending === null) return null;
  const pasting = pending.quote === "";
  const save = async (quote, note) => {
    if (note.trim() === "") return;
    await add(host, quote, pending.ref, note);
    await setPending(null);
  };
  const submit = async (value) => {
    if (!pasting) return save(pending.quote, value);
    if (value.trim() === "") return;
    if (pending.note !== void 0) return save(value, pending.note);
    await setPending((d) => d === null ? d : { ...d, quote: value });
  };
  return /* @__PURE__ */ jsxs(Card, { selected: true, children: [
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: pasting ? "The selection is not shared here: copy the text from the chat and paste it below." : `Commenting on: \u201C${preview(pending.quote, Math.max(20, columns - 24))}\u201D` }),
    /* @__PURE__ */ jsx(
      Field,
      {
        autoFocus: true,
        rows: pasting ? 3 : void 0,
        placeholder: pasting ? "Paste the quoted text, Enter to continue" : "Your comment, Enter to save",
        submitLabel: pasting ? "next" : "save",
        onInput: pasting ? void 0 : (value) => setPending((d) => d === null ? d : { ...d, note: value }),
        onSubmit: submit,
        fallback: NO_INPUT
      },
      pasting ? "quote" : "note"
    ),
    /* @__PURE__ */ jsxs(Row, { children: [
      pasting ? null : /* @__PURE__ */ jsx(Button, { variant: "primary", onPress: () => save(pending.quote, pending.note ?? ""), children: "Save" }, "save"),
      /* @__PURE__ */ jsx(Button, { onPress: () => setPending(null), children: "Cancel" }, "cancel")
    ] })
  ] }, "draft-card");
}
function CommentCard({ comment, index }) {
  const host = useHost();
  const [edit, setEdit] = useAtom(editing);
  const [, setComments] = useAtom(comments);
  const { columns } = useViewport();
  const id = comment.id;
  const isEditing = edit?.id === id;
  const saveNote = async (value) => {
    const text = value.trim();
    if (text !== "") await setComments((all) => all.map((x) => x.id === id ? { ...x, note: text } : x));
    await setEdit(null);
  };
  return /* @__PURE__ */ jsxs(
    Box,
    {
      kind: "card",
      borderStyle: "round",
      borderColor: isEditing ? "cyan" : void 0,
      borderDimColor: !isEditing,
      paddingX: 1,
      flexDirection: "column",
      children: [
        /* @__PURE__ */ jsxs(Row, { justify: "space-between", children: [
          /* @__PURE__ */ jsxs(Text, { children: [
            /* @__PURE__ */ jsx(Text, { bold: true, children: `[${index + 1}]` }),
            " ",
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: `\u201C${preview(comment.quote, Math.max(20, columns - 24))}\u201D` })
          ] }),
          comment.ref !== void 0 ? /* @__PURE__ */ jsx(Button, { onPress: () => host.scrollTo(comment.ref), children: "\u2197 Jump" }, `go-${id}`) : null
        ] }),
        isEditing ? /* @__PURE__ */ jsx(
          Field,
          {
            autoFocus: true,
            value: edit.note,
            placeholder: "Edit comment, Enter to save",
            submitLabel: "save",
            onInput: (value) => setEdit((e) => e === null ? e : { ...e, note: value }),
            onSubmit: saveNote,
            fallback: "This surface takes no input."
          },
          `edit-note-${id}`
        ) : /* @__PURE__ */ jsx(Text, { children: comment.note }),
        /* @__PURE__ */ jsx(Row, { children: isEditing ? [
          /* @__PURE__ */ jsx(Button, { variant: "primary", onPress: () => saveNote(edit.note), children: "Save" }, `save-${id}`),
          /* @__PURE__ */ jsx(Button, { onPress: () => setEdit(null), children: "Cancel" }, `cancel-${id}`)
        ] : [
          /* @__PURE__ */ jsx(
            Button,
            {
              onPress: async () => {
                await host.set(draft, null);
                await setEdit({ id, note: comment.note });
              },
              children: "Edit"
            },
            `edit-${id}`
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              onPress: async () => {
                await setComments((all) => all.filter((x) => x.id !== id));
                await setEdit((e) => e?.id === id ? null : e);
              },
              children: "Delete"
            },
            `del-${id}`
          )
        ] })
      ]
    },
    `card-${id}`
  );
}
function CommentsPane() {
  const host = useHost();
  const list = useValue(comments);
  const pending = useValue(draft);
  const { surface, harness } = useViewport();
  const pasteOnly = surface === "vscode" || harness === "agy";
  const pick = async () => {
    if (await capture(host, "") === "paste") await host.pane.focus("quote", PANE);
  };
  return /* @__PURE__ */ jsxs(Column, { children: [
    /* @__PURE__ */ jsx(DraftCard, {}),
    list.length === 0 && pending === null ? /* @__PURE__ */ jsx(
      EmptyState,
      {
        message: pasteOnly ? "Copy text from the chat, then press \u201C+ Paste Quote\u201D or run /comment." : "Select text in the chat, then press \u201C+ Add Comment\u201D or run /comment."
      }
    ) : null,
    list.map((c, i) => /* @__PURE__ */ jsx(CommentCard, { comment: c, index: i }, `comment-${c.id}`)),
    /* @__PURE__ */ jsxs(Row, { children: [
      /* @__PURE__ */ jsx(Button, { hotkey: "c", onPress: pick, children: pasteOnly ? "+ Paste Quote" : "+ Add Comment" }, "pick"),
      list.length > 0 ? /* @__PURE__ */ jsx(Button, { variant: "primary", onPress: () => sendAll(host), children: "Append all to Chat" }, "send") : null,
      list.length > 0 ? /* @__PURE__ */ jsx(Button, { onPress: () => clear(host), children: "Clear all" }, "clear") : null
    ] }),
    list.length > 0 ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: `${countLabel(list.length)} will be appended to your next message.` }) : null
  ] });
}

// plugins/quote-comments/src/plugin.tsx
var NO_PANE = "No selection is shared here and the Comments pane cannot be shown: select text in the chat first (in the terminal this works in fullscreen mode only).";
var plugin_default = definePlugin({
  name: "quote-comments",
  displayName: "Quote Comments",
  version: "0.3.0",
  description: "Comment on text selected in the chat: collect quoted comments and append them to your next message",
  panes: {
    [PANE]: { title: "Comments", component: CommentsPane }
  },
  commands: {
    comment: {
      description: "Comment on the text selected in the chat; the comment is appended to your next message",
      argumentHint: "[comment]",
      run: async (host, args) => {
        const kind = await capture(host, args);
        if (kind === "hidden") return NO_PANE;
        if (kind === "saved") host.toast(`Comment saved: ${countLabel((await host.get(comments)).length)} for your next message`);
        if (kind === "paste") host.toast("The selection is not shared here: paste the quote into the Comments pane");
        return void 0;
      }
    }
  },
  claude: {
    // The next message carries the comments; the list is cleared once it went through.
    promptSubmit: async (host, e) => {
      const list = await host.get(comments);
      if (e.command !== void 0 || e.isMeta === true || list.length === 0) return void 0;
      return {
        text: appendComments(e.text, list),
        after: async () => {
          await clear(host);
          await host.pane.close(PANE);
        }
      };
    }
  }
});

// packages/bifrost/src/agy/index.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { watch } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// packages/bifrost/src/core/host.ts
var WIDE_COLUMNS = 90;
var viewport = (v) => ({ ...v, wide: v.columns >= WIDE_COLUMNS });

// packages/bifrost/src/agy/bifrost.css
var bifrost_default = `/*
 * Bifrost webview theme for the Antigravity aux pane. Colors come from the host's theme variables
 * (--background, --foreground, --muted-foreground, --border, --accent), which preload.js sets inline on
 * the root on theme-change. Those names (and --muted, --card, --primary\u2026) belong to the host: ours are
 * all --bf-*, or the inline values would override them (--muted there is a background color).
 * The bf-* classes mirror the TUI primitives: flex boxes, rounded frames, dim text, compact buttons.
 */

:root {
  --bf-bg: var(--background, #1e1e1e);
  --bf-fg: var(--foreground, #cccccc);
  --bf-line: var(--border, rgba(128, 128, 128, 0.3));
  --bf-accent: var(--accent, #3794ff);
  --bf-muted: var(--muted-foreground, color-mix(in srgb, var(--bf-fg) 60%, transparent));
  --bf-surface: color-mix(in srgb, var(--bf-fg) 5%, transparent);
  --bf-surface-strong: color-mix(in srgb, var(--bf-fg) 10%, transparent);
  --bf-code-bg: color-mix(in srgb, var(--bf-fg) 8%, transparent);
  --bf-radius: 6px;
  --bf-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --bf-font-mono: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  /* named TUI colors */
  --bf-cyan: var(--bf-accent);
  --bf-blue: var(--bf-accent);
  --bf-green: #3fb950;
  --bf-red: #f85149;
  --bf-yellow: #d29922;
  --bf-magenta: #bc8cff;
  --bf-gray: var(--bf-muted);
  --bf-white: var(--bf-fg);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: var(--bf-bg);
  color: var(--bf-fg);
  font-family: var(--bf-font-sans);
  font-size: 13px;
  line-height: 1.5;
}

#bf-root {
  padding: 10px 12px;
}

.bf-box {
  display: flex;
  min-width: 0;
}

.bf-frame {
  border: 1px solid var(--bf-line);
  border-radius: var(--bf-radius);
  padding-block: 0.35em;
  background: var(--bf-surface);
}

.bf-frame-dim {
  border-color: var(--bf-line);
}

.bf-card + .bf-card {
  margin-top: 0.5em;
}

.bf-detail {
  min-width: 0;
  background: transparent;
}

.bf-header {
  border-bottom: 1px solid var(--bf-line);
  padding-bottom: 0.5em;
}

.bf-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.bf-dim {
  color: var(--bf-muted);
}

.bf-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bf-btn {
  font: inherit;
  font-size: 12px;
  color: var(--bf-fg);
  background: var(--bf-surface-strong);
  border: 1px solid var(--bf-line);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.bf-btn:hover {
  border-color: var(--bf-accent);
}

/* a column stretches its children; buttons keep their own width */
.bf-col > .bf-btn {
  align-self: flex-start;
}

.bf-row > .bf-text {
  flex-shrink: 1;
}

.bf-btn:focus-visible,
.bf-input:focus,
.bf-select:focus {
  outline: 1px solid var(--bf-accent);
  outline-offset: 1px;
}

.bf-primary {
  background: var(--bf-accent);
  border-color: var(--bf-accent);
  color: #fff;
}

.bf-input,
.bf-select {
  font: inherit;
  width: 100%;
  color: var(--bf-fg);
  background: var(--bf-bg);
  border: 1px solid var(--bf-line);
  border-radius: 4px;
  padding: 4px 8px;
}

textarea.bf-input {
  resize: vertical;
}

.bf-label {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  width: 100%;
}

.bf-md {
  min-width: 0;
  overflow-wrap: anywhere;
}

.bf-md :is(h2, h3, h4, h5, h6) {
  margin: 0.6em 0 0.3em;
  font-size: 13px;
}

.bf-md p,
.bf-md ul,
.bf-md ol {
  margin: 0 0 0.5em;
}

.bf-md code,
.bf-code {
  font-family: var(--bf-font-mono);
  font-size: 12px;
  background: var(--bf-code-bg);
  border-radius: 3px;
}

.bf-md code {
  padding: 0 3px;
}

.bf-md pre,
.bf-code {
  padding: 8px;
  overflow-x: auto;
}

.bf-md pre code {
  padding: 0;
  background: none;
}

.bf-md blockquote {
  margin: 0 0 0.5em;
  padding-left: 0.75em;
  border-left: 3px solid var(--bf-line);
  color: var(--bf-muted);
}

.bf-md table {
  border-collapse: collapse;
  margin-bottom: 0.5em;
}

.bf-md :is(th, td) {
  border: 1px solid var(--bf-line);
  padding: 2px 6px;
}

a {
  color: var(--bf-accent);
}

.bf-toast {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  max-width: calc(100vw - 24px);
  padding: 6px 12px;
  border-radius: var(--bf-radius);
  background: var(--bf-surface-strong);
  border: 1px solid var(--bf-accent);
  backdrop-filter: blur(6px);
  z-index: 10;
}
`;

// packages/bifrost/src/agy/client.js
var client_default = "// Bifrost page runtime for the agy webview. The server renders; this file only shows the HTML,\n// posts events back (by data-bf-id) and carries out effects. No framework, no build step.\n;(() => {\n  const root = document.getElementById('bf-root')\n  if (!root) return\n  const pane = root.dataset.pane\n  const token = new URLSearchParams(location.search).get('token')\n  let workspaceUris = []\n  let version = -1\n  let selection = ''\n  let inflight = 0\n\n  const headers = () => {\n    const h = { 'Content-Type': 'application/json' }\n    if (token) h['X-Sidecar-Token'] = token\n    return h\n  }\n\n  // cells across the pane, measured with the page's own font\n  const probe = document.createElement('span')\n  probe.textContent = 'x'.repeat(100)\n  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'\n  document.body.appendChild(probe)\n  const columns = () => Math.max(20, Math.floor(root.clientWidth / Math.max(1, probe.getBoundingClientRect().width / 100)))\n\n  async function post(path, body) {\n    inflight++\n    try {\n      const res = await fetch(path, {\n        method: 'POST',\n        headers: headers(),\n        body: JSON.stringify({ pane, columns: columns(), workspaceUris, selection, ...body }),\n      })\n      const data = await res.json()\n      if (!res.ok) throw new Error(data.error || res.statusText)\n      if (typeof data.version === 'number') version = data.version\n      patch(data.html)\n      for (const e of data.effects || []) run(e)\n    } catch (err) {\n      toast(`Error: ${err.message || err}`)\n    } finally {\n      inflight--\n    }\n  }\n\n  // Swap the HTML, keeping the focused field (by key), its caret and the scroll position.\n  function patch(html) {\n    const active = document.activeElement\n    const key = active?.dataset?.bfKey\n    const caret = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd, active.value] : null\n    const scroll = document.scrollingElement?.scrollTop ?? 0\n    root.innerHTML = html\n    if (key) {\n      const again = root.querySelector(`[data-bf-key=\"${CSS.escape(key)}\"]`)\n      if (again) {\n        // typed ahead of the server (input is debounced): the page's text wins until it is submitted\n        if (caret && active.dataset.dirty && again.value !== caret[2]) {\n          again.value = caret[2]\n          again.dataset.dirty = '1'\n        }\n        again.focus()\n        if (caret) again.setSelectionRange(caret[0], caret[1])\n      }\n    }\n    if (document.scrollingElement) document.scrollingElement.scrollTop = scroll\n  }\n\n  const send = (el, kind, value) => post('/_bf/event', { id: el.dataset.bfId, kind, value })\n\n  function run(e) {\n    if (e.type === 'toast') toast(e.message)\n    else if (e.type === 'prompt') toChat(e.text)\n    else if (e.type === 'submit') submit(e.text)\n    else if (e.type === 'focus') root.querySelector(`[data-bf-key=\"${CSS.escape(e.key)}\"]`)?.focus()\n  }\n\n  // Into the chat prompt: the host's two messages, then the clipboard as a fallback.\n  async function toChat(text) {\n    try {\n      window.parent.postMessage({ type: 'add-chat-context', payload: { text } }, '*')\n      window.parent.postMessage({ type: 'insert-prompt', payload: { text } }, '*')\n    } catch {}\n    try {\n      await navigator.clipboard.writeText(text)\n    } catch {}\n  }\n\n  async function submit(text) {\n    try {\n      if (window.sidecar?.agent?.sendMessage) return await window.sidecar.agent.sendMessage(text)\n    } catch {}\n    await toChat(text)\n  }\n\n  function toast(message) {\n    const el = document.createElement('div')\n    el.className = 'bf-toast'\n    el.textContent = message\n    document.body.appendChild(el)\n    setTimeout(() => el.remove(), 2600)\n  }\n\n  // the selection is read before the press collapses it\n  document.addEventListener('pointerdown', ev => {\n    if (ev.target.closest?.('button[data-bf-id]')) selection = String(window.getSelection() || '')\n  })\n  root.addEventListener('click', ev => {\n    const btn = ev.target.closest('button[data-bf-id]')\n    if (!btn) return\n    send(btn, 'press').finally(() => {\n      selection = ''\n    })\n  })\n\n  const timers = new WeakMap()\n  root.addEventListener('input', ev => {\n    const el = ev.target\n    if (!el.matches?.('[data-bf-id].bf-input')) return\n    el.dataset.dirty = '1'\n    clearTimeout(timers.get(el))\n    timers.set(\n      el,\n      setTimeout(() => send(el, 'input', el.value), 250),\n    )\n  })\n  root.addEventListener('keydown', ev => {\n    const el = ev.target\n    if (!el.matches?.('[data-bf-id].bf-input')) return\n    const multiline = el.tagName === 'TEXTAREA'\n    if (ev.key === 'Enter' && (!multiline || ev.ctrlKey || ev.metaKey) && !ev.isComposing) {\n      ev.preventDefault()\n      clearTimeout(timers.get(el))\n      delete el.dataset.dirty\n      send(el, 'submit', el.value)\n    }\n  })\n  root.addEventListener('change', ev => {\n    if (ev.target.matches?.('select[data-bf-id]')) send(ev.target, 'select', ev.target.value)\n  })\n\n  // a Button's hotkey works while no field has the keyboard\n  document.addEventListener('keydown', ev => {\n    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('input, textarea, select')) return\n    const btn = root.querySelector(`button[data-bf-hotkey=\"${CSS.escape(ev.key)}\"]`)\n    if (btn) {\n      ev.preventDefault()\n      btn.click()\n    }\n  })\n\n  let resizeTimer\n  new ResizeObserver(() => {\n    clearTimeout(resizeTimer)\n    resizeTimer = setTimeout(() => post('/_bf/render', {}), 200)\n  }).observe(root)\n\n  // live updates: state changed by someone else (another request, a timer)\n  const stream = new EventSource(`/_bf/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`)\n  stream.addEventListener('change', ev => {\n    if (inflight === 0 && Number(ev.data) > version) post('/_bf/render', {})\n  })\n  stream.addEventListener('hello', ev => {\n    // a restarted server (dev rebuild) starts over at version 0\n    if (Number(ev.data) < version) post('/_bf/render', { initial: true })\n  })\n\n  const start = uris => {\n    workspaceUris = Array.isArray(uris) ? uris : []\n    post('/_bf/render', { initial: true })\n  }\n  if (window.sidecar?.getWorkspaceUris) {\n    window.sidecar.getWorkspaceUris().then(start, () => start([]))\n    window.sidecar.onWorkspaceChange?.(uris => {\n      workspaceUris = uris\n      post('/_bf/render', {})\n    })\n  } else start([])\n})()\n";

// packages/bifrost/src/agy/fs.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
var nodeFs = {
  async list(dir = ".") {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return await Promise.all(
        entries.map(async (e) => {
          const st = await stat(join(dir, e.name)).catch(() => void 0);
          return { name: e.name, kind: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other", mtimeMs: st?.mtimeMs ?? 0 };
        })
      );
    } catch {
      return [];
    }
  },
  read: (path) => readFile(path, "utf8")
};

// packages/bifrost/src/agy/markdown.ts
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderInline(text) {
  if (!text) return "";
  let out = text.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = /^(https?:\/\/|file:\/\/|\/|#)/i.test(url) ? url : "#";
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return out;
}
function renderMarkdown(rawMd) {
  if (!rawMd || typeof rawMd !== "string") return "";
  const escaped = escapeHtml(rawMd.replace(/\r\n/g, "\n"));
  const codeBlocks = [];
  const placeholderPrefix = "@@CODEBLOCK_";
  const withPlaceholders = escaped.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const cleanLang = lang.trim();
    const langClass = cleanLang ? ` class="language-${cleanLang}"` : "";
    codeBlocks.push(`<pre><code${langClass}>${code.replace(/^\n+|\n+$/g, "")}</code></pre>`);
    return `${placeholderPrefix}${idx}@@`;
  });
  const lines = withPlaceholders.split("\n");
  const htmlBlocks = [];
  let inList = false;
  let listType = null;
  let inBlockquote = false;
  let blockquoteLines = [];
  let inTable = false;
  let tableRows = [];
  function closeList() {
    if (inList) {
      htmlBlocks.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  }
  function closeBlockquote() {
    if (inBlockquote) {
      htmlBlocks.push(`<blockquote><p>${blockquoteLines.map(renderInline).join("<br/>")}</p></blockquote>`);
      inBlockquote = false;
      blockquoteLines = [];
    }
  }
  function closeTable() {
    if (inTable) {
      if (tableRows.length > 0) {
        let tableHtml = '<div class="table-wrapper"><table>';
        const hasHeader = tableRows.length >= 2 && /^\|?(\s*:?-+:?\s*\|)+\s*$/.test(tableRows[1] ?? "");
        if (hasHeader) {
          const headerCells = (tableRows[0] ?? "").split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map((c) => `<th>${renderInline(c.trim())}</th>`).join("");
          tableHtml += `<thead><tr>${headerCells}</tr></thead>`;
          const bodyRows = tableRows.slice(2);
          if (bodyRows.length > 0) {
            tableHtml += "<tbody>";
            for (const row of bodyRows) {
              const cells = row.split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map((c) => `<td>${renderInline(c.trim())}</td>`).join("");
              tableHtml += `<tr>${cells}</tr>`;
            }
            tableHtml += "</tbody>";
          }
        } else {
          tableHtml += "<tbody>";
          for (const row of tableRows) {
            const cells = row.split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map((c) => `<td>${renderInline(c.trim())}</td>`).join("");
            tableHtml += `<tr>${cells}</tr>`;
          }
          tableHtml += "</tbody>";
        }
        tableHtml += "</table></div>";
        htmlBlocks.push(tableHtml);
      }
      inTable = false;
      tableRows = [];
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed) {
      closeList();
      closeBlockquote();
      closeTable();
      continue;
    }
    const cbMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (cbMatch) {
      closeList();
      closeBlockquote();
      closeTable();
      const idx = Number.parseInt(cbMatch[1] ?? "0", 10);
      htmlBlocks.push(codeBlocks[idx] ?? "");
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeBlockquote();
      closeTable();
      const level = (headingMatch[1] ?? "#").length;
      const targetLevel = Math.min(level + 1, 6);
      const text = headingMatch[2] ?? "";
      htmlBlocks.push(`<h${targetLevel}>${renderInline(text)}</h${targetLevel}>`);
      continue;
    }
    const bqMatch = trimmed.match(/^(&gt;|>)\s?(.*)$/);
    if (bqMatch) {
      closeList();
      closeTable();
      inBlockquote = true;
      blockquoteLines.push(bqMatch[2] ?? "");
      continue;
    }
    if (inBlockquote) {
      closeBlockquote();
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    }
    if (inTable) {
      closeTable();
    }
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        closeList();
        inList = true;
        listType = "ul";
        htmlBlocks.push("<ul>");
      }
      htmlBlocks.push(`<li>${renderInline(ulMatch[1] ?? "")}</li>`);
      continue;
    }
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        closeList();
        inList = true;
        listType = "ol";
        htmlBlocks.push("<ol>");
      }
      htmlBlocks.push(`<li>${renderInline(olMatch[1] ?? "")}</li>`);
      continue;
    }
    closeList();
    closeBlockquote();
    closeTable();
    htmlBlocks.push(`<p>${renderInline(trimmed)}</p>`);
  }
  closeList();
  closeBlockquote();
  closeTable();
  return htmlBlocks.join("\n");
}

// packages/bifrost/src/agy/html.ts
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var escapeHtml2 = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);
var SPACE = { xs: 0.25, sm: 0.5, md: 1, lg: 1.5, xl: 2 };
var space = (v) => v === void 0 ? void 0 : typeof v === "number" ? `${v * 0.5}em` : SPACE[String(v)] !== void 0 ? `${SPACE[String(v)]}em` : void 0;
var size = (v) => v === void 0 ? void 0 : typeof v === "number" ? `${v}ch` : String(v);
var color = (c) => typeof c === "string" ? `var(--bf-${c.replace(/[^\w-]/g, "")}, ${c.replace(/[^\w#-]/g, "")})` : void 0;
var safeHref = (href) => /^(https?:\/\/|file:\/\/|\/|#)/i.test(href) ? href : "#";
var KIND_TAG = {
  card: "article",
  list: "section",
  toolbar: "nav",
  header: "header",
  detail: "article",
  section: "section"
};
function style(entries) {
  const css = Object.entries(entries).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}:${v}`).join(";");
  return css === "" ? "" : ` style="${escapeHtml2(css)}"`;
}
var attr = (name, value) => value === void 0 ? "" : ` ${name}="${escapeHtml2(value)}"`;
function renderHtml(tree) {
  const handlers = /* @__PURE__ */ new Map();
  let auto = 0;
  const idFor = (key) => {
    let id = typeof key === "string" && key !== "" ? key : `_${auto++}`;
    while (handlers.has(id)) id = `${id}~`;
    handlers.set(id, {});
    return id;
  };
  const children = (n, inText) => n.children.map((c) => node(c, inText)).join("");
  function box(n) {
    const p = n.props;
    const tag = KIND_TAG[String(p.kind)] ?? "div";
    const cls = [
      "bf-box",
      p.flexDirection === "row" ? "bf-row" : "bf-col",
      p.borderStyle ? "bf-frame" : "",
      p.borderDimColor ? "bf-frame-dim" : "",
      p.kind ? `bf-${p.kind}` : ""
    ].filter(Boolean).join(" ");
    const css = style({
      "flex-direction": p.flexDirection === "row" ? "row" : "column",
      "flex-grow": p.flexGrow,
      "flex-shrink": p.flexShrink,
      "flex-wrap": p.flexWrap,
      "align-items": p.alignItems,
      "justify-content": p.justifyContent,
      gap: space(p.gap),
      width: size(p.width),
      "min-width": size(p.minWidth),
      margin: space(p.margin),
      "margin-inline": space(p.marginX),
      "margin-block": space(p.marginY),
      "margin-top": space(p.marginTop),
      "margin-bottom": space(p.marginBottom),
      padding: space(p.padding),
      "padding-inline": space(p.paddingX),
      "padding-block": space(p.paddingY),
      "border-color": p.borderColor ? color(p.borderColor) : void 0
    });
    return `<${tag} class="${cls}"${css}>${children(n, false)}</${tag}>`;
  }
  function text(n, inText) {
    const p = n.props;
    const tag = inText ? "span" : "div";
    const cls = ["bf-text", p.dimColor ? "bf-dim" : "", p.wrap === "truncate-end" ? "bf-truncate" : ""].filter(Boolean).join(" ");
    const deco = [p.underline ? "underline" : "", p.strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
    const css = style({
      color: p.color ? color(p.color) : void 0,
      "font-weight": p.bold ? 600 : void 0,
      "font-style": p.italic ? "italic" : void 0,
      "text-decoration": deco || void 0
    });
    return `<${tag} class="${cls}"${css}>${children(n, true)}</${tag}>`;
  }
  function element(n, inText) {
    const p = n.props;
    switch (n.type) {
      case "Box":
        return box(n);
      case "Text":
        return text(n, inText);
      case "Button": {
        const id = idFor(p.key);
        handlers.get(id).press = p.onPress;
        const label = p.label ?? textOf(n.children);
        const cls = p.variant === "primary" ? "bf-btn bf-primary" : "bf-btn";
        return `<button type="button" class="${cls}" data-bf-id="${escapeHtml2(id)}"${attr("data-bf-hotkey", p.hotkey)}>${escapeHtml2(label)}</button>`;
      }
      case "Input": {
        const id = idFor(p.key);
        const h = handlers.get(id);
        h.input = p.onInput;
        h.submit = p.onSubmit;
        const common = `class="bf-input" data-bf-id="${escapeHtml2(id)}" data-bf-key="${escapeHtml2(String(p.key))}"${attr("placeholder", p.placeholder)}${attr("aria-label", p.label)}${p.autoFocus ? " autofocus" : ""}`;
        const value = p.value ?? "";
        const field = typeof p.rows === "number" && p.rows > 1 ? `<textarea ${common} rows="${p.rows}">${escapeHtml2(value)}</textarea>` : `<input type="text" ${common} value="${escapeHtml2(value)}">`;
        return p.label ? `<label class="bf-label">${escapeHtml2(String(p.label))}${field}</label>` : field;
      }
      case "Select": {
        const id = idFor(p.key);
        handlers.get(id).select = p.onSelect;
        const options = p.options.map((o) => `<option value="${escapeHtml2(o.value)}"${o.value === p.value ? " selected" : ""}>${escapeHtml2(o.label)}</option>`).join("");
        return `<select class="bf-select" data-bf-id="${escapeHtml2(id)}"${attr("aria-label", p.label)}>${options}</select>`;
      }
      case "Markdown":
        return `<div class="bf-md${p.dimColor ? " bf-dim" : ""}">${renderMarkdown(String(p.text ?? ""))}</div>`;
      case "Code": {
        const lang = typeof p.language === "string" ? ` class="language-${escapeHtml2(p.language)}"` : "";
        return `<pre class="bf-code"><code${lang}>${escapeHtml2(String(p.source ?? ""))}</code></pre>`;
      }
      case "Link": {
        const label = p.label ?? textOf(n.children);
        return `<a href="${escapeHtml2(safeHref(String(p.href)))}" target="_blank" rel="noopener noreferrer">${escapeHtml2(label)}</a>`;
      }
    }
  }
  function node(n, inText) {
    if (n === null || n === void 0 || typeof n === "boolean") return "";
    if (typeof n === "string" || typeof n === "number") return escapeHtml2(String(n));
    if (Array.isArray(n)) return n.map((c) => node(c, inText)).join("");
    return isElement(n) ? element(n, inText) : "";
  }
  return { html: node(tree, false), handlers };
}

// packages/bifrost/src/agy/preload.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";
var FALLBACK = `(function () {
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
`;
function preloadJs(home = homedir()) {
  for (const p of [
    join2(home, ".gemini", "config", "node_modules", "sidecar_sdk", "preload.js"),
    join2(home, ".gemini", "antigravity", "lib", "node_modules", "sidecar_sdk", "preload.js")
  ]) {
    try {
      if (existsSync(p)) return readFileSync(p, "utf8");
    } catch {
    }
  }
  return FALLBACK;
}

// packages/bifrost/src/agy/index.ts
var MAX_BODY = 1 << 20;
function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        fail(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        done(body === "" ? {} : JSON.parse(body));
      } catch (err) {
        fail(err);
      }
    });
    req.on("error", fail);
  });
}
function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(body);
}
var json = (res, data, status = 200) => send(res, status, "application/json", JSON.stringify(data));
function workspacePath(uri) {
  if (uri.startsWith("file:")) {
    try {
      return fileURLToPath(uri);
    } catch {
      return void 0;
    }
  }
  return uri.includes("://") ? void 0 : resolve(uri);
}
var envKey = (plugin, key) => `${plugin}_${key}`.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
function createAgyApp(plugin, options = {}) {
  const env = options.env ?? process.env;
  const token = options.token ?? env.ANTIGRAVITY_SIDECAR_UI_TOKEN;
  const fs = options.fs ?? nodeFs;
  const store = new MemoryStore();
  const panes = /* @__PURE__ */ new Map();
  const streams = /* @__PURE__ */ new Set();
  let version = 0;
  let workspace;
  store.subscribe(() => {
    version++;
    for (const s of streams) s.write(`event: change
data: ${version}

`);
  });
  const paneState = (id) => {
    const s = panes.get(id) ?? { known: /* @__PURE__ */ new Map(), handlers: /* @__PURE__ */ new Map() };
    panes.set(id, s);
    return s;
  };
  const requests = new AsyncLocalStorage();
  const effect = (e) => requests.getStore()?.effects.push(e);
  const host = {
    harness: "agy",
    get: (a) => store.get(a),
    set: (a, next) => store.set(a, next),
    fs,
    cwd: async () => workspace ?? options.cwd ?? process.cwd(),
    config: async (key) => configValue(env[envKey(plugin.name, key)]) ?? configValue(plugin.config?.[key]?.default),
    selection: async () => {
      const selection = requests.getStore()?.request.selection;
      const text = typeof selection === "string" ? selection : "";
      return text.trim() === "" ? void 0 : { text };
    },
    prompt: {
      append: async (text) => void effect({ type: "prompt", mode: "append", text }),
      replace: async (text) => void effect({ type: "prompt", mode: "replace", text }),
      read: async () => "",
      submit: async (text) => void effect({ type: "submit", text })
    },
    toast: (message) => void effect({ type: "toast", message }),
    pane: {
      open: async () => true,
      close: async () => {
      },
      focus: async (key) => void effect({ type: "focus", key })
    },
    scrollTo: async () => {
    }
  };
  async function render(paneId, request) {
    const pane = plugin.panes?.[paneId];
    if (!pane) throw new Error(`unknown pane ${paneId}`);
    const state = paneState(paneId);
    const onOpen = pane.onOpen;
    if (request.initial && onOpen)
      await Promise.resolve().then(() => onOpen(host)).catch((err) => console.error("onOpen failed:", err));
    const columns = typeof request.columns === "number" && request.columns > 0 ? Math.floor(request.columns) : 80;
    const vp = viewport({ harness: "agy", surface: "web", columns, canInput: true });
    const tree = await renderComponent(pane.component, { host, viewport: vp, known: state.known, label: `${plugin.name}/${paneId}` });
    const { html, handlers } = renderHtml(tree);
    state.handlers = handlers;
    return html;
  }
  function shell(paneId, url) {
    const q = token ? `?token=${encodeURIComponent(url.searchParams.get("token") ?? "")}` : "";
    const title = escapeHtml2(plugin.panes?.[paneId]?.title ?? plugin.displayName ?? plugin.name);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/_bf/style.css${q}">
<script src="/preload.js"></script>
</head>
<body>
<main id="bf-root" data-pane="${escapeHtml2(paneId)}"><p class="bf-text bf-dim">Loading\u2026</p></main>
<script src="/_bf/client.js${q}"></script>
</body>
</html>
`;
  }
  const authorized = (req, url) => !token || req.headers["x-sidecar-token"] === token || url.searchParams.get("token") === token;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    try {
      if (path === "/preload.js") return send(res, 200, "application/javascript", preloadJs());
      if (!authorized(req, url)) return json(res, { error: "Unauthorized: missing or invalid sidecar token" }, 401);
      if (req.method === "GET") {
        if (path === "/api/health") return json(res, { status: "ok", name: plugin.name, version: plugin.version });
        if (path === "/_bf/client.js") return send(res, 200, "application/javascript", client_default);
        if (path === "/_bf/style.css") return send(res, 200, "text/css", bifrost_default);
        if (path === "/_bf/stream") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
          res.write(`event: hello
data: ${version}

`);
          streams.add(res);
          const ping = setInterval(() => res.write(": ping\n\n"), 25e3);
          req.on("close", () => {
            clearInterval(ping);
            streams.delete(res);
          });
          return;
        }
        const first = defaultPane(plugin);
        if ((path === "/" || path === "/index.html") && first) return send(res, 200, "text/html", shell(first, url));
        const m = /^\/pane\/([a-z][a-z0-9-]*)$/.exec(path);
        if (m && plugin.panes?.[m[1]]) return send(res, 200, "text/html", shell(m[1], url));
      }
      if (req.method === "POST" && (path === "/_bf/render" || path === "/_bf/event")) {
        const body = await readBody(req);
        const uri = Array.isArray(body.workspaceUris) ? body.workspaceUris.find((u) => typeof u === "string") : void 0;
        if (uri) workspace = workspacePath(uri) ?? workspace;
        const paneId = typeof body.pane === "string" ? body.pane : defaultPane(plugin) ?? "";
        const effects = [];
        const html = await requests.run({ request: body, effects }, async () => {
          const handler = path === "/_bf/event" && body.kind ? panes.get(paneId)?.handlers.get(String(body.id))?.[body.kind] : void 0;
          if (handler) {
            const run = handler;
            await Promise.resolve().then(() => run(typeof body.value === "string" ? body.value : void 0)).catch((err) => console.error("handler failed:", err));
          }
          return render(paneId, body);
        });
        return json(res, { html, effects, version });
      }
      json(res, { error: "Not found", path }, 404);
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  return {
    server,
    store,
    start(port = options.port ?? (Number(env.ANTIGRAVITY_SIDECAR_WEB_PORT) || 0)) {
      return new Promise((done, fail) => {
        server.once("error", fail);
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address();
          done(typeof addr === "object" && addr ? addr.port : port);
        });
      });
    },
    stop() {
      for (const s of streams) s.end();
      streams.clear();
      return new Promise((done) => server.close(() => done()));
    }
  };
}
async function runAgy(plugin, options = {}) {
  const app = createAgyApp(plugin, options);
  const port = await app.start();
  console.log(`[${plugin.name}] agy pane on 127.0.0.1:${port}`);
  if (options.dev) {
    const self = fileURLToPath(import.meta.url);
    watch(self, () => process.exit(0));
  }
}

// plugins/quote-comments/server.js
runAgy(plugin_default, { dev: false });
