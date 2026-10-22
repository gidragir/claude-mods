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
function send(res, status2, type, body) {
  res.writeHead(status2, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(body);
}
var json = (res, data, status2 = 200) => send(res, status2, "application/json", JSON.stringify(data));
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

// plugins/ref-pane/server.js
runAgy(plugin_default, { dev: false });
