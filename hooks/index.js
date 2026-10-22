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

// packages/bifrost/src/core/fs.ts
function boundTraversalByRecency(items2, getMtimeMs, limit = 10) {
  return [...items2].sort((a, b) => getMtimeMs(b) - getMtimeMs(a)).slice(0, limit);
}

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
function truncate(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  if (max <= 1) return clean.slice(0, Math.max(0, max));
  return `${clean.slice(0, max - 1)}\u2026`;
}
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
function Card({ key, selected: selected2 = false, accent = "cyan", grow, children }) {
  return /* @__PURE__ */ jsx(
    Box,
    {
      kind: "card",
      borderStyle: "round",
      borderColor: selected2 ? accent : void 0,
      borderDimColor: !selected2,
      paddingX: 1,
      flexDirection: "column",
      flexGrow: grow ? 1 : void 0,
      children
    },
    key
  );
}
function Header({ title, subtitle, actions }) {
  return /* @__PURE__ */ jsxs(Box, { kind: "header", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs(Row, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: title }),
      subtitle !== void 0 && subtitle !== "" ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: subtitle }) : null
    ] }),
    actions ?? null
  ] });
}
function Toolbar({ children, marginBottom }) {
  return /* @__PURE__ */ jsx(Box, { kind: "toolbar", flexDirection: "row", flexWrap: "wrap", gap: 1, marginBottom, children });
}
function EmptyState({ message, hint, framed = false }) {
  const body = [/* @__PURE__ */ jsx(Text, { dimColor: true, children: message }), hint !== void 0 && hint !== "" ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: hint }) : null];
  return framed ? /* @__PURE__ */ jsx(Card, { children: body }) : /* @__PURE__ */ jsx(Column, { children: body });
}
function Field({ fallback = "This surface takes no input.", ...props }) {
  if (!useViewport().canInput) return fallback === "" ? null : /* @__PURE__ */ jsx(Text, { dimColor: true, children: fallback });
  return /* @__PURE__ */ jsx(Input, { ...props });
}
function SearchInput({ key = "search", value, placeholder = "Filter\u2026", onInput, onSubmit }) {
  return /* @__PURE__ */ jsx(Field, { value, placeholder, onInput, onSubmit: onSubmit ?? onInput, fallback: "" }, key);
}
function MasterDetail(props) {
  const { items: items2, selectedId, onSelect, getId, label = getId, meta, preview, detail, actions, sidebarWidth = 36 } = props;
  const { wide, columns } = useViewport();
  if (items2.length === 0) return null;
  const card = (item, selected2, width) => {
    const id = getId(item);
    return /* @__PURE__ */ jsxs(Card, { selected: selected2, children: [
      /* @__PURE__ */ jsxs(Row, { justify: "space-between", children: [
        /* @__PURE__ */ jsx(Button, { variant: selected2 ? "primary" : "secondary", onPress: () => onSelect(id), children: label(item) }, `pick-${id}`),
        meta ? /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate-end", children: meta(item) }) : null
      ] }),
      preview ? preview(item, width) : null
    ] }, `card-${id}`);
  };
  const walk = (item) => {
    const at = items2.findIndex((x) => getId(x) === getId(item));
    const prev = items2[(at - 1 + items2.length) % items2.length];
    const next = items2[(at + 1) % items2.length];
    return [
      /* @__PURE__ */ jsx(Button, { hotkey: "p", onPress: () => onSelect(getId(prev)), children: "\u2190 (p)" }, "prev"),
      /* @__PURE__ */ jsx(Button, { hotkey: "n", onPress: () => onSelect(getId(next)), children: "(n) \u2192" }, "next")
    ];
  };
  const detailCard = (item) => /* @__PURE__ */ jsxs(
    Box,
    {
      kind: "detail",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 1,
      flexDirection: "column",
      flexGrow: 1,
      children: [
        /* @__PURE__ */ jsxs(Row, { justify: "space-between", marginBottom: 1, children: [
          /* @__PURE__ */ jsxs(Row, { children: [
            /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: `[${label(item)}]` }),
            meta ? /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate-end", children: meta(item) }) : null
          ] }),
          wide ? /* @__PURE__ */ jsxs(Row, { children: [
            actions ? actions(item) : null,
            walk(item)
          ] }) : null
        ] }),
        detail(item)
      ]
    },
    `detail-${getId(item)}`
  );
  if (wide) {
    const active = items2.find((x) => getId(x) === selectedId) ?? items2[0];
    return /* @__PURE__ */ jsxs(Row, { align: "flex-start", children: [
      /* @__PURE__ */ jsx(Box, { kind: "list", width: sidebarWidth, flexDirection: "column", children: items2.map((x) => card(x, getId(x) === getId(active), sidebarWidth - 4)) }),
      detailCard(active)
    ] });
  }
  const current2 = items2.find((x) => getId(x) === selectedId);
  if (current2 === void 0)
    return /* @__PURE__ */ jsx(Box, { kind: "list", flexDirection: "column", children: items2.map((x) => card(x, false, columns - 4)) });
  return /* @__PURE__ */ jsxs(Column, { children: [
    /* @__PURE__ */ jsxs(Toolbar, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Button, { hotkey: "b", onPress: () => onSelect(null), children: "\u2190 Overview (b)" }, "back"),
      actions ? actions(current2) : null,
      walk(current2)
    ] }),
    /* @__PURE__ */ jsx(Toolbar, { marginBottom: 1, children: items2.map((x) => /* @__PURE__ */ jsx(Button, { variant: x === current2 ? "primary" : "secondary", onPress: () => onSelect(getId(x)), children: label(x) }, `pick-${getId(x)}`)) }),
    detailCard(current2)
  ] });
}

// plugins/ref-pane/src/refs.ts
var ID_SRC = String.raw`(?<![\w-])([A-Z]{1,4})-(\d{1,4}|[A-Z]{1,2}\d{1,4})(?![\w-])`;
var ID = new RegExp(ID_SRC, "g");
var ID_FIRST = new RegExp(ID_SRC);
var DIRS = ["review", "feedback", "tasklist", "prd", "research", "plan", "adr", "debug"];
var HOME = {
  RV: "review",
  FB: "feedback",
  T: "tasklist",
  TASK: "tasklist",
  ADR: "adr",
  DBG: "debug",
  OQ: "prd",
  BQ: "prd",
  RD: "prd",
  D: "plan",
  Q: "prd",
  FR: "prd",
  NFR: "prd",
  AC: "prd",
  US: "prd"
};
var MAX_SECTION = 4e3;
function parsePrefixes(src) {
  const out = {};
  for (const part of src.split(/[,;\n]/)) {
    const [p = "", d = ""] = part.split("=").map((x) => x.trim());
    if (/^[A-Z]{1,4}$/.test(p)) out[p] = d || p.toLowerCase();
  }
  return out;
}
var canon = (prefix, n) => `${prefix}-${/^\d+$/.test(n) ? n.padStart(3, "0") : n}`;
function findIds(text, prefixes) {
  const seen = [];
  for (const m of text.matchAll(ID)) {
    const id = canon(m[1], m[2]);
    if (!seen.includes(id)) seen.push(id);
  }
  if (prefixes) {
    const customKeys = Array.isArray(prefixes) ? prefixes : Object.keys(prefixes);
    const longKeys = customKeys.filter((k) => k.length > 4 && /^[A-Z]+$/.test(k));
    if (longKeys.length > 0) {
      const longSrc = String.raw`(?<![\w-])(${longKeys.join("|")})-(\d{1,4}|[A-Z]{1,2}\d{1,4})(?![\w-])`;
      const longRegex = new RegExp(longSrc, "g");
      for (const m of text.matchAll(longRegex)) {
        const id = canon(m[1], m[2]);
        if (!seen.includes(id)) seen.push(id);
      }
    }
  }
  return seen;
}
var leadsWith = (s, id) => {
  const m = ID_FIRST.exec(s);
  if (m !== null && canon(m[1], m[2]) === id) return true;
  const prefix = id.split("-")[0];
  if (prefix.length > 4) {
    const customFirst = new RegExp(String.raw`(?<![\w-])(${prefix})-(\d{1,4}|[A-Z]{1,2}\d{1,4})(?![\w-])`);
    const cm = customFirst.exec(s);
    return cm !== null && canon(cm[1], cm[2]) === id;
  }
  return false;
};
function extractSection(md, id) {
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,6})\s/.exec(l);
    if (h && leadsWith(l, id)) {
      let end = i + 1;
      while (end < lines.length) {
        const n = /^(#{1,6})\s/.exec(lines[end]);
        if (n && n[1].length <= h[1].length) break;
        end++;
      }
      return { line: i + 1, text: lines.slice(i, end).join("\n").trim().slice(0, MAX_SECTION) };
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const head = l.slice(0, 24);
    if (/^\s*(\||[-*]\s|\d+\.\s|\*\*)/.test(l) && leadsWith(head, id)) {
      if (l.trimStart().startsWith("|")) return { line: i + 1, text: l.trim() };
      let end = i + 1;
      while (end < lines.length && /^(\s{2,}\S|\s*$)/.test(lines[end]) && end - i < 12) end++;
      return { line: i + 1, text: lines.slice(i, end).join("\n").trim().slice(0, MAX_SECTION) };
    }
  }
  return closedBy(lines, id);
}
function closedBy(lines, id) {
  const prefix = id.split("-")[0];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const by = /(?:closes|закрыва[а-яё]*)\s+([^).]*)/i.exec(l);
    if (!by || !findIds(by[1], [prefix]).includes(id)) continue;
    const lead = findIds(l.slice(0, 24), [prefix])[0];
    if (lead === void 0 || lead === id) continue;
    let end = i + 1;
    while (end < lines.length && /^(\s{2,}\S|\s*$)/.test(lines[end]) && end - i < 12) end++;
    const body = lines.slice(i, end).join("\n").trim().slice(0, MAX_SECTION);
    return { line: i + 1, text: `**${id}** closed by decision **${lead}**:

${body}` };
  }
  return void 0;
}
var isDocsRoot = (r) => r.endsWith("/docs");
function rootsIn(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Za-z]:[\\/][^\r\n:`"'<>|*?]*?[\\/](?:features|docs)(?![\w-])/g)) {
    const r = m[0].replaceAll("\\", "/");
    if (!out.includes(r)) out.push(r);
  }
  return out;
}
async function ticketDirs(fs, roots2, hint) {
  const all = [];
  for (const root of roots2) {
    const entries = await fs.list(root).catch(() => []);
    for (const e of entries) if (e.kind === "dir") all.push({ name: e.name, path: `${root}/${e.name}`, mtimeMs: e.mtimeMs ?? 0 });
  }
  const mentions = (key) => key !== "" && new RegExp(`(?<![\\w-])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(hint);
  const mentioned = all.filter((d) => mentions(d.name.split(/[-_ ]/).slice(0, 2).join("-")));
  const rest = all.filter((d) => !mentioned.includes(d)).sort((x, y) => y.mtimeMs - x.mtimeMs);
  return (mentioned.length > 0 ? mentioned : rest).map((d) => d.path);
}
function docDirs(cwd) {
  if (!cwd) return [];
  const parts = cwd.replaceAll("\\", "/").replace(/[/]+$/, "").split("/");
  const out = [];
  for (let up = 0; up < 3 && parts.length - up > 1; up++) out.push(`${parts.slice(0, parts.length - up).join("/")}/docs`);
  return out;
}
async function resolveRefs(fs, cwd, ids, hint, known = [], prefixes = HOME) {
  ids = ids.filter((id) => prefixes[id.split("-")[0]] !== void 0);
  const dirs = [...DIRS, ...Object.values(prefixes).filter((d) => !DIRS.includes(d))];
  if (ids.length === 0) return [];
  const cwdRoot = cwd ? [`${cwd.replaceAll("\\", "/")}/features`] : [];
  const roots2 = [...rootsIn(hint), ...known, ...cwdRoot].filter((r, i, a) => a.indexOf(r) === i);
  const tickets = await ticketDirs(
    fs,
    roots2.filter((r) => !isDocsRoot(r)),
    hint
  );
  const out = [];
  const cache = /* @__PURE__ */ new Map();
  const load = async (p) => {
    if (!cache.has(p)) cache.set(p, await fs.read(p).catch(() => null));
    return cache.get(p);
  };
  const listed = /* @__PURE__ */ new Map();
  const mdFiles = async (dir) => {
    let names = listed.get(dir);
    if (names === void 0) {
      names = (await fs.list(dir).catch(() => [])).filter((f) => f.kind === "file" && f.name.endsWith(".md") && !/_humanized|_presentation/.test(f.name)).map((f) => f.name);
      listed.set(dir, names);
    }
    return names;
  };
  const docs = [...roots2.filter(isDocsRoot), ...docDirs(cwd)].filter((r, i, a) => a.indexOf(r) === i);
  const fromDocs = async (id) => {
    let weak;
    for (const dir of docs) {
      for (const name of await mdFiles(dir)) {
        const file = `${dir}/${name}`;
        const md = await load(file);
        const sec = md && extractSection(md, id);
        if (!sec) continue;
        const ref = { id, file, line: sec.line, text: sec.text };
        if (/^\s*[|#]/.test(sec.text)) return ref;
        weak ??= ref;
      }
    }
    return weak;
  };
  for (const id of ids) {
    const prefix = id.split("-")[0];
    const home = prefixes[prefix];
    const order = home ? [home, ...dirs.filter((d) => d !== home)] : dirs;
    let found = await fromDocs(id);
    if (!found)
      search: for (const t of tickets) {
        for (const d of order) {
          for (const name of await mdFiles(`${t}/${d}`)) {
            const file = `${t}/${d}/${name}`;
            const md = await load(file);
            const sec = md && extractSection(md, id);
            if (sec) {
              found = { id, file, line: sec.line, text: sec.text };
              break search;
            }
          }
        }
      }
    if (found) out.push(found);
  }
  return out;
}
var shortPath = (p) => p.replace(/^.*[/]features[/]/, "features/");
function gistOf(text, max = 200) {
  const [first = "", ...rest] = text.split("\n");
  const head = first.replace(/^[#\s>*-]+/, "").replace(/\*\*/g, "");
  const body = rest.filter((l) => l.trim() !== "").join(" ").replace(/\s+/g, " ");
  const src = body === "" ? head : body;
  return { head: head.slice(0, 90), gist: src.length > max ? `${src.slice(0, max)}\u2026` : src };
}
var isArtifact = (e) => e.kind === "file" && e.name.endsWith(".md") && !/_humanized|_presentation/.test(e.name);
async function discoverRefs(fs, cwd, known, prefixes, limit = 30) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const scan = async (dir, entries) => {
    for (const e of (entries ?? await fs.list(dir).catch(() => [])).filter(isArtifact)) {
      const file = `${dir}/${e.name}`;
      const content = await fs.read(file).catch(() => "");
      for (const id of content ? findIds(content, prefixes) : []) {
        if (seen.has(id)) continue;
        const sec = extractSection(content, id);
        if (!sec) continue;
        seen.add(id);
        out.push({ id, file, line: sec.line, text: sec.text });
        if (out.length >= limit) return true;
      }
    }
    return false;
  };
  for (const dir of /* @__PURE__ */ new Set([...docDirs(cwd), ...known.filter(isDocsRoot)])) if (await scan(dir)) return out;
  const cwdFeatures = cwd ? [`${cwd.replaceAll("\\", "/")}/features`] : [];
  const dirNames = new Set(Object.values(prefixes));
  for (const root of /* @__PURE__ */ new Set([...known.filter((r) => !isDocsRoot(r)), ...cwdFeatures])) {
    const tickets = (await fs.list(root).catch(() => [])).filter((e) => e.kind === "dir");
    for (const ticket of boundTraversalByRecency(tickets, (e) => e.mtimeMs ?? 0, 10)) {
      const ticketPath = `${root}/${ticket.name}`;
      const children = await fs.list(ticketPath).catch(() => []);
      if (await scan(ticketPath, children)) return out;
      for (const sub of children.filter((e) => e.kind === "dir" && dirNames.has(e.name)))
        if (await scan(`${ticketPath}/${sub.name}`)) return out;
    }
  }
  return out;
}

// plugins/ref-pane/src/store.ts
var MAX_ITEMS = 30;
var MAX_ROOTS = 10;
var items = atom("items", []);
var selected = atom("selected", null);
var roots = atom("roots", []);
var status = atom("status", "");
var query = atom("query", "");
async function prefixesOf(host) {
  const raw = await host.config("prefixes");
  const custom = raw === void 0 ? {} : parsePrefixes(raw);
  return Object.keys(custom).length > 0 ? custom : HOME;
}
async function learnRoots(host, text) {
  const seen = rootsIn(text);
  if (seen.length > 0) await host.set(roots, (list) => [...seen, ...list.filter((r) => !seen.includes(r))].slice(0, MAX_ROOTS));
}
async function remember(host, found) {
  const before = await host.get(items);
  await host.set(items, (list) => [...found, ...list.filter((x) => !found.some((f) => f.id === x.id))].slice(0, MAX_ITEMS));
  return found.some((f) => !before.some((x) => x.id === f.id));
}
async function lookup(host, text) {
  const prefixes = await prefixesOf(host);
  const ids = findIds(text, prefixes);
  if (ids.length === 0) return void 0;
  await learnRoots(host, text);
  const cwd = await host.cwd();
  const known = await host.get(roots);
  const found = await resolveRefs(host.fs, cwd, ids, text, known, prefixes);
  await host.set(status, `${ids.join(", ")} \u2192 found ${found.length}; cwd: ${cwd ?? "?"}; roots: ${known.length}`);
  const fresh = found.length > 0 && await remember(host, found);
  return { ids, found, searched: [...known, "cwd/features"], fresh };
}
async function discover(host, reselect = false) {
  const found = await discoverRefs(host.fs, await host.cwd(), await host.get(roots), await prefixesOf(host));
  if (found.length === 0) return;
  await remember(host, found);
  await host.set(selected, (prev) => (reselect ? null : prev) ?? found[0].id);
}
async function addToChat(host, item) {
  const sel = await host.selection();
  const quote = (sel?.text ?? item.text).trim();
  if (quote === "") return;
  const meta = shortPath(item.file) ? ` (${shortPath(item.file)}:${item.line})` : "";
  const lines = quote.split("\n").map((l) => `> ${l}`).join("\n");
  await host.prompt.append(`
> **[${item.id}]**${meta}:
${lines}

`);
  host.toast(sel ? `Added selected text from [${item.id}] to chat` : `Added [${item.id}] context to chat prompt`);
}

// plugins/ref-pane/src/ui.tsx
var matches = (item, q) => [item.id, item.text, item.file].some((s) => s.toLowerCase().includes(q));
function RefsPane() {
  const host = useHost();
  const list = useValue(items);
  const last = useValue(status);
  const [sel, setSel] = useAtom(selected);
  const [q, setQ] = useAtom(query);
  const needle = q.trim().toLowerCase();
  const shown = needle === "" ? list : list.filter((x) => matches(x, needle));
  const subtitle = list.length === 0 ? "(0 refs)" : shown.length === list.length ? plural(shown.length, "ref") : `${plural(shown.length, "ref")} (filtered from ${list.length})`;
  return /* @__PURE__ */ jsxs(Column, { children: [
    /* @__PURE__ */ jsx(
      Header,
      {
        title: "REFS PANE",
        subtitle,
        actions: needle !== "" ? /* @__PURE__ */ jsx(Button, { hotkey: "c", onPress: () => setQ(""), children: "Clear (c)" }, "clear-filter") : null
      }
    ),
    /* @__PURE__ */ jsx(
      SearchInput,
      {
        value: q,
        placeholder: "Filter or query reference IDs (e.g. RV-1, FB-2, T-3)...",
        onInput: setQ,
        onSubmit: async (value) => {
          await setQ(value);
          const hit = await lookup(host, value);
          if (hit && hit.found.length > 0) await setSel(hit.found[0].id);
        }
      },
      "search-input"
    ),
    list.length === 0 ? /* @__PURE__ */ jsx(
      EmptyState,
      {
        framed: true,
        message: "No references yet. They will appear from the model's answer or via /ref RV-1.",
        hint: last !== "" ? `Last search: ${last}` : void 0
      }
    ) : shown.length === 0 ? /* @__PURE__ */ jsx(EmptyState, { framed: true, message: `No refs matching "${q.trim()}".` }) : /* @__PURE__ */ jsx(
      MasterDetail,
      {
        items: shown,
        selectedId: sel,
        onSelect: setSel,
        getId: (x) => x.id,
        meta: (x) => `${shortPath(x.file)}:${x.line}`,
        preview: (x, width) => {
          const g = gistOf(x.text);
          return [
            g.head !== "" ? /* @__PURE__ */ jsx(Text, { bold: true, color: x.id === sel ? "cyan" : void 0, children: truncate(g.head, Math.max(16, width)) }) : null,
            g.gist !== "" ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: truncate(g.gist, Math.max(16, width)) }) : null
          ];
        },
        detail: (x) => /* @__PURE__ */ jsx(Markdown, { text: x.text }, `md-${x.id}`),
        actions: (x) => /* @__PURE__ */ jsx(Button, { hotkey: "a", onPress: () => addToChat(host, x), children: "Add to chat (a)" }, "add-context")
      }
    )
  ] });
}

// plugins/ref-pane/src/plugin.tsx
var plugin_default = definePlugin({
  name: "ref-pane",
  displayName: "Refs Pane",
  version: "0.4.0",
  description: "A pane of references like RV-1/FB-2/T-3 from the model reply: shows the ticket artifact section right in the session",
  suggestedPrompts: ["Show artifact reference RV-1", "List all references mentioned in the latest review", "Open the Refs auxiliary pane"],
  config: {
    prefixes: {
      type: "string",
      title: "Artifact prefixes",
      description: "Custom comma-separated list of PREFIX=dir entries (1\u20134 uppercase Latin letters), for example: RV=review, FB=feedback, T=tasklist. Without an equals sign, the directory is the lowercase prefix. Replaces the default set (RV, FB, T, TASK, ADR, DBG, OQ, BQ, RD, D, Q, FR, NFR, AC, US); empty means the defaults are used.",
      default: ""
    }
  },
  panes: {
    refs: {
      title: "Refs",
      component: RefsPane,
      onOpen: async (host) => {
        if ((await host.get(items)).length === 0) await discover(host);
      }
    }
  },
  commands: {
    ref: {
      description: "Show an artifact section by reference: /ref RV-1 (no argument: open the pane)",
      argumentHint: "[RV-1 ...]",
      run: async (host, args) => {
        const hit = await lookup(host, args);
        if (hit) {
          if (hit.found.length === 0) return `Not found: ${hit.ids.join(", ")}. Searched in: ${hit.searched.join(", ")}`;
          await host.set(selected, hit.found[0].id);
          await host.set(query, "");
        }
        await host.pane.open("refs", { focus: true });
        return "Refs pane opened.";
      }
    }
  },
  claude: {
    promptSubmit: async (host, e) => {
      await learnRoots(host, e.text);
      return void 0;
    },
    // References in the main loop's answer land in the pane; the pane opens when one is new.
    turnComplete: async (host, e) => {
      await learnRoots(host, e.answer);
      if (e.agentId !== void 0) return;
      const hit = await lookup(host, e.answer);
      if (hit?.fresh) await host.pane.open("refs");
    },
    // New prefixes may define references the old set did not: look again.
    configChange: async (host, key) => {
      if (key === "prefixes") await discover(host, true);
    }
  }
});

// bifrost:virtual:bifrost/claude-state
import { atom as atom2, read, update } from "claude-code";
var a0 = atom2({ plugin: "ref-pane", key: "__config" }, void 0);
var a1 = atom2({ plugin: "ref-pane", key: "items" }, void 0);
var a2 = atom2({ plugin: "ref-pane", key: "query" }, void 0);
var a3 = atom2({ plugin: "ref-pane", key: "roots" }, void 0);
var a4 = atom2({ plugin: "ref-pane", key: "selected" }, void 0);
var a5 = atom2({ plugin: "ref-pane", key: "status" }, void 0);
var CELLS = /* @__PURE__ */ new Set(["__config", "items", "query", "roots", "selected", "status"]);
function readCell($, key) {
  switch (key) {
    case "__config":
      return read($, a0);
    case "items":
      return read($, a1);
    case "query":
      return read($, a2);
    case "roots":
      return read($, a3);
    case "selected":
      return read($, a4);
    case "status":
      return read($, a5);
  }
  return Promise.resolve(void 0);
}
function writeCell($, key, fn) {
  switch (key) {
    case "__config":
      return update($, a0, fn);
    case "items":
      return update($, a1, fn);
    case "query":
      return update($, a2, fn);
    case "roots":
      return update($, a3, fn);
    case "selected":
      return update($, a4, fn);
    case "status":
      return update($, a5, fn);
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

// plugins/ref-pane/register.js
const register = (on, options) => install(on, options, plugin_default);
export {
  register
};
