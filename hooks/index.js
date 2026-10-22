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
var CONFIG_CELL = "__config";
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
    const read2 = await Promise.all(atoms.map((a) => host.get(a)));
    const f = { host, viewport: viewport2, values: new Map(atoms.map((a, i) => [a.key, read2[i]])), missing: /* @__PURE__ */ new Map() };
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

// bifrost:virtual:bifrost/claude-state
import { atom as atom2, read, update } from "claude-code";
var a0 = atom2({ plugin: "quote-comments", key: "comments" }, void 0);
var a1 = atom2({ plugin: "quote-comments", key: "draft" }, void 0);
var a2 = atom2({ plugin: "quote-comments", key: "editing" }, void 0);
var a3 = atom2({ plugin: "quote-comments", key: "nextId" }, void 0);
var CELLS = /* @__PURE__ */ new Set(["comments", "draft", "editing", "nextId"]);
function readCell($, key) {
  switch (key) {
    case "comments":
      return read($, a0);
    case "draft":
      return read($, a1);
    case "editing":
      return read($, a2);
    case "nextId":
      return read($, a3);
  }
  return Promise.resolve(void 0);
}
function writeCell($, key, fn) {
  switch (key) {
    case "comments":
      return update($, a0, fn);
    case "draft":
      return update($, a1, fn);
    case "editing":
      return update($, a2, fn);
    case "nextId":
      return update($, a3, fn);
  }
  return Promise.resolve(void 0);
}

// packages/bifrost/src/core/host.ts
var WIDE_COLUMNS = 90;
var viewport = (v) => ({ ...v, wide: v.columns >= WIDE_COLUMNS });

// packages/bifrost/src/claude/elements.ts
function guard(fn) {
  return Promise.resolve().then(fn).then(
    () => void 0,
    (err) => console.error("bifrost handler failed:", err)
  );
}
var drop = (props, ...keys) => {
  const out = {};
  for (const [k, v] of Object.entries(props)) if (v !== void 0 && !keys.includes(k)) out[k] = v;
  return out;
};
function element(node, table) {
  const p = node.props;
  const children = () => node.children.map((c) => convert(c, table));
  const tag = table[node.type];
  switch (node.type) {
    case "Box":
      return table.Box({ ...drop(p, "kind"), children: children() });
    case "Text":
      return table.Text({ ...p, children: children() });
    case "Button": {
      const onPress = p.onPress;
      const label = p.label ?? textOf(node.children);
      return table.Button({ ...drop(p, "onPress", "label"), label, onPress: () => guard(onPress) });
    }
    case "Input": {
      if (!tag) return null;
      const { onInput, onSubmit, autoFocus } = p;
      return tag({
        ...drop(p, "onInput", "onSubmit", "autoFocus"),
        ...autoFocus ? { autoFocus: true } : {},
        ...onInput ? { onInput: (v) => guard(() => onInput(v)) } : {},
        onSubmit: (v) => guard(() => onSubmit(v))
      });
    }
    case "Select": {
      if (!tag) return null;
      const onSelect = p.onSelect;
      return tag({ ...drop(p, "onSelect"), onSelect: (v) => guard(() => onSelect(v)) });
    }
    case "Link":
      return table.Link({ href: p.href, label: p.label ?? textOf(node.children) });
    default:
      return tag ? tag(drop(p)) : null;
  }
}
function convert(node, table) {
  if (node === null || node === void 0 || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) return node.map((c) => convert(c, table));
  return isElement(node) ? element(node, table) : null;
}
function toEngine(tree, table) {
  if (isElement(tree) && tree.type === "Box") return convert(tree, table);
  return table.Box({ flexDirection: "column", children: [convert(tree, table)] });
}

// packages/bifrost/src/claude/index.ts
var stray = new MemoryStore();
var reported = /* @__PURE__ */ new Set();
function strayAtom(key) {
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`bifrost: state "${key}" is not known to the build (declare it with atom() at module level); it resets on reload`);
}
function readAtom($, a) {
  if (!CELLS.has(a.key)) {
    strayAtom(a.key);
    return stray.get(a);
  }
  return readCell($, a.key).then(
    (v) => v === void 0 ? a.initial : v,
    () => a.initial
  );
}
function writeAtom($, a, next) {
  if (!CELLS.has(a.key)) {
    strayAtom(a.key);
    return stray.set(a, next);
  }
  return writeCell($, a.key, (prev) => applyUpdater(prev === void 0 ? a.initial : prev, next)).then(
    () => void 0,
    () => void 0
  );
}
function readConfig($) {
  return readCell($, CONFIG_CELL).then(
    (v) => v && typeof v === "object" ? v : {},
    () => ({})
  );
}
function writeConfig($, key, value) {
  return writeCell($, CONFIG_CELL, (prev) => ({ ...prev && typeof prev === "object" ? prev : {}, [key]: value })).then(
    () => void 0,
    () => void 0
  );
}
function engineFs($) {
  return {
    list: (p) => $.fs.list(p),
    read: (p) => $.fs.read(p)
  };
}
function claudeHost($, plugin, options) {
  const title = (id) => plugin.panes?.[id]?.title ?? id;
  const host = {
    harness: "claude",
    get: (a) => readAtom($, a),
    set: (a, next) => writeAtom($, a, next),
    fs: engineFs($),
    cwd: () => $.session.cwd().catch(() => void 0),
    config: async (key) => {
      const stored = await readConfig($);
      return configValue(stored[key]) ?? configValue(options[key]) ?? configValue(plugin.config?.[key]?.default);
    },
    selection: async () => {
      const sel = await $.ui.selection().catch(() => void 0);
      if (!sel || sel.text.trim() === "") return void 0;
      return sel.requestId === void 0 ? { text: sel.text } : { text: sel.text, ref: sel.requestId };
    },
    prompt: {
      append: async (text) => {
        await $.prompt.fill({ text, mode: "append" }).catch(() => void 0);
      },
      replace: async (text) => {
        await $.prompt.fill({ text, mode: "replace" }).catch(() => void 0);
      },
      read: () => $.prompt.read().then(
        (box) => box.text,
        () => ""
      ),
      submit: async (text) => {
        await $.prompt.submit({ text, asUser: true }).catch(() => void 0);
      }
    },
    toast: (message) => {
      try {
        $.ui.toast(message);
      } catch {
      }
    },
    pane: {
      open: async (id = defaultPane(plugin), options2 = {}) => {
        if (id === void 0) return false;
        const onOpen = plugin.panes?.[id]?.onOpen;
        if (onOpen) await guard(() => onOpen(host));
        const shown = await $.ui.open({ id, title: title(id), ...options2.focus ? { focus: true } : {} }).catch(() => void 0);
        return shown?.isPlaced === true;
      },
      close: async (id = defaultPane(plugin)) => {
        if (id !== void 0) await $.ui.close({ id }).catch(() => void 0);
      },
      focus: async (key, id = defaultPane(plugin)) => {
        if (id !== void 0) await $.ui.focus({ requestId: id, key }).catch(() => void 0);
      }
    },
    scrollTo: async (ref) => {
      await $.ui.scroll({ to: { requestId: ref }, block: "center" }).catch(() => void 0);
    }
  };
  return host;
}
var configKey = (plugin, raw) => {
  const key = raw.slice(raw.lastIndexOf(".") + 1);
  return plugin.config && key in plugin.config ? key : void 0;
};
function install(on, options, plugin) {
  const known = /* @__PURE__ */ new Map();
  const knownFor = (pane) => {
    const m = known.get(pane) ?? /* @__PURE__ */ new Map();
    known.set(pane, m);
    return m;
  };
  on("session.start", async ($, e, next) => {
    for (const [name, cmd] of Object.entries(plugin.commands ?? {})) {
      const spec = { name, description: cmd.description, ...cmd.argumentHint ? { argumentHint: cmd.argumentHint } : {} };
      await $.command.register(spec).catch(() => void 0);
    }
    const hook = plugin.claude?.sessionStart;
    if (hook) {
      const host = claudeHost($, plugin, options);
      await guard(() => hook(host));
    }
    return next(e);
  }).catch((_$, e, next) => next(e));
  for (const [name, cmd] of Object.entries(plugin.commands ?? {})) {
    on("command.run", { command: name }, async ($, e) => {
      const host = claudeHost($, plugin, options);
      const out = await cmd.run(host, typeof e.args === "string" ? e.args : "");
      return typeof out === "string" ? { text: out } : {};
    }).catch((_$, e, next) => next.called ? next(e) : { text: `${plugin.name}: /${name} failed.` });
  }
  for (const [id, pane] of Object.entries(plugin.panes ?? {})) {
    on("ui.render", { component: "Pane", requestId: id }, async ($, e) => {
      const table = $.ui.resolve(e);
      const host = claudeHost($, plugin, options);
      const vp = viewport({ harness: "claude", surface: e.surface, columns: e.props.bodyColumns, canInput: "Input" in table });
      const tree = await renderComponent(pane.component, { host, viewport: vp, known: knownFor(id), label: `${plugin.name}/${id}` });
      return toEngine(tree, table);
    });
  }
  const promptSubmit = plugin.claude?.promptSubmit;
  if (promptSubmit) {
    on("prompt.submit", async ($, e, next) => {
      const host = claudeHost($, plugin, options);
      const res = await promptSubmit(host, { text: e.text, command: e.command?.name, isMeta: e.isMeta });
      if (res === void 0) return next(e);
      const out = await next({ ...e, text: typeof res === "string" ? res : res.text });
      if (typeof res === "object" && res.after) await guard(res.after);
      return out;
    }).catch((_$, e, next) => next(e));
  }
  const turnComplete = plugin.claude?.turnComplete;
  if (turnComplete) {
    on("turn.complete", async ($, e, next) => {
      const host = claudeHost($, plugin, options);
      await guard(() => turnComplete(host, { answer: e.answer, ...e.agentId === void 0 ? {} : { agentId: e.agentId } }));
      return next(e);
    }).catch((_$, e, next) => next(e));
  }
  const configChange = plugin.claude?.configChange;
  if (plugin.config || configChange) {
    on("config.set", async ($, e, next) => {
      const res = await next(e);
      const key = configKey(plugin, e.key);
      if (key !== void 0) {
        await writeConfig($, key, typeof e.value === "string" ? e.value : String(e.value ?? ""));
        if (configChange) {
          const host = claudeHost($, plugin, options);
          await guard(() => configChange(host, key, e.value));
        }
      }
      return res;
    }).catch((_$, e, next) => next(e));
  }
}

// plugins/quote-comments/register.js
const register = (on, options) => install(on, options, plugin_default);
export {
  register
};
