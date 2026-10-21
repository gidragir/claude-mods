# claude-mods

Satellite repository for **Claude Code** mods (function hook plugins) and **Antigravity** sidecars & plugins in TypeScript: a pnpm workspace with shared toolchain, zero-dependency SSR components, engine-based tests, and hot reload in Claude Desktop.

| Plugin / Mod | Target | What it does |
| --- | --- | --- |
| [ref-pane](plugins/ref-pane) | Claude Code & Antigravity | A pane with `RV-1`/`FB-2`/`T-3`/`ADR-4` references from conversation turns or project docs: interactive TUI in Claude Code and webview in Antigravity Auxiliary Pane with SSR markdown rendering |
| [quote-comments](plugins/quote-comments) | Claude Code | Comment on text selected in the chat: quoted comments collect in a pane and are appended to your next message |

---

## Dual-Target Architecture

Plugins in this repository are designed to run seamlessly across two target developer environments:

1. **Claude Code Mods (TUI)**:
   - Function-hook plugins executed in a sandboxed TypeScript environment (`hooks/register.tsx`, `hooks/*.ts`).
   - Hooks into engine lifecycle events (`tool.call`, `prompt.submit`, `ui.render`).
   - Interactive terminal UI components with instant hot reload in Claude Desktop.

2. **Antigravity Sidecars & Plugins (IDE Auxiliary Pane)**:
   - Background webview HTTP microservices (`sidecars/<mod>/server.mjs`, `sidecar.json`) integrated directly into the Antigravity Auxiliary Pane.
   - Zero-dependency server-side rendered (SSR) Markdown with syntax styling, table rendering, and artifact badge generation.
   - Reactive theme variable adaptation and active workspace synchronization.
   - Agent skills (`skills/<mod>/SKILL.md`) and citation rules (`rules/AGENTS.md`).

---

## Project Structure

```
claude-mods/
├── plugins/
│   └── <mod>/
│       ├── .claude-plugin/      # Plugin manifest (plugin.json) & engine declarations
│       ├── hooks/               # Pure TS logic (*.ts, *.test.ts) and Claude Code hooks (register.tsx)
│       ├── sidecars/            # Antigravity background servers, sidecar.json, and webview UI
│       │   └── <mod>/
│       │       ├── server.mjs   # HTTP server & /api/refs endpoint
│       │       ├── markdown.mjs # Zero-dependency SSR markdown renderer
│       │       └── ui/          # HTML/CSS webview bundle
│       ├── skills/              # Agent skills for Antigravity (SKILL.md)
│       ├── rules/               # Agent artifact standards & rules (AGENTS.md)
│       ├── docs/                # Screenshots and documentation assets
│       └── package.json         # Workspace package configuration
├── scripts/                     # Cross-platform dev, link, and test automation (Node.js)
├── types/                       # Claude Code engine API declarations
├── biome.json                   # Biome formatting and linting rules
└── package.json                 # Root scripts and dev dependencies
```

---

## Installing a Mod

### Claude Code

```
/plugin marketplace add gidragir/claude-mods
/plugin install <mod>@claude-mods
```

### Antigravity

Link plugins and sidecars into your local Antigravity environment via:

```bash
pnpm dev:link:gemini <mod>
```

Or manually create directory junctions in PowerShell:
```powershell
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\<mod>" -Target "$PWD\plugins\<mod>"
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\<mod>" -Target "$PWD\plugins\<mod>\sidecars\<mod>"
```

---

## Development

Requires [mise](https://mise.jdx.dev) (installs Node >= 24 and pnpm from `mise.toml`) and the Claude Code CLI.

```bash
mise install && pnpm install
pnpm types:sync         # engine type declarations (not committed); needs a mod loaded once, see below
pnpm check              # validate + typecheck + test for all Claude Code mods
pnpm test:sidecar       # run Node test suite for Antigravity sidecars & SSR renderer
pnpm test:all           # run both engine tests and sidecar tests
pnpm lint               # Biome lint check
pnpm format             # Biome format write
pnpm new my-mod "what it does"
```

### Connecting to Claude Desktop with Hot Reload

```bash
pnpm dev:link:desktop
```

Writes `CLAUDE_CODE_PLUGIN_DIRS` (mod folders, each loaded as a `--plugin-dir`) and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` into the `env` of `~/.claude/settings.json`. A new Desktop session loads the mods straight from the repository, and every save reloads the mod — no reinstall or version bump needed. To disconnect: `pnpm dev:unlink:desktop`. Daily backups are saved as `settings.json.<date>.bak`.

For `claude` run from a terminal in this repository: `pnpm dev:link` — writes to `mise.local.toml` (ignored by git, template in `mise.local.toml.example`).

### Alongside Installed Plugins

The repository only **adds** mod folders to what is already loaded: installed plugins (`enabledPlugins`), marketplaces, `pluginConfigs`, and `~/.claude/skills` are left unchanged, and other entries in `CLAUDE_CODE_PLUGIN_DIRS` are preserved. `pnpm dev:status` shows everything loaded besides the repository, along with name conflicts. `dev:link` skips a mod that has the same name as an installed and enabled plugin, and `pnpm new` rejects such a name.

### Edit Loop

1. `pnpm watch my-mod` in a terminal — typecheck and tests on every save.
2. Edit `plugins/my-mod/hooks/*` or `plugins/my-mod/sidecars/*` → hot reloads automatically.
3. Check sidecar tests via `pnpm test:sidecar`.
4. Load problems appear as a dim line in the transcript; for details, use `claude --debug`.

### Engine Types

`types/engine/` holds API declarations of the installed Claude Code version. It is generated and not committed: run `pnpm types:sync` after cloning (before `pnpm check`) and after every Claude Code update.

For details on mod conventions and runtime constraints, see [AGENTS.md](AGENTS.md).
