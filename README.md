# claude-mods

Claude Code mods (function hooks plugins) in TypeScript: a pnpm workspace, a shared toolchain, engine-based tests, and hot reload in Claude Desktop.

| Mod | What it does |
| --- | --- |
| [ref-pane](plugins/ref-pane) | A pane with RV-1/FB-2/T-3 references from the model's reply: a click shows the matching section of the ticket artifact |

## Installing a mod (for others)

```
/plugin marketplace add gidragir/claude-mods
/plugin install <mod>@claude-mods
```

## Development

Requires [mise](https://mise.jdx.dev) (installs node and pnpm from `mise.toml`) and the Claude Code CLI.

```bash
mise install && pnpm install
pnpm types:sync         # engine type declarations (not committed); needs a mod loaded once, see below
pnpm check              # validate + typecheck + test for all mods
pnpm new my-mod "what it does"
```

### Connecting to Claude Desktop with hot reload

```bash
pnpm dev:link:desktop
```

Writes the `CLAUDE_CODE_PLUGIN_DIRS` (mod folders, each loaded as a `--plugin-dir`) and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` variables into the `env` of `~/.claude/settings.json`. A new Desktop session loads the mods straight from the repository, and every save reloads the mod — no reinstall or version bump. To disconnect: `pnpm dev:unlink:desktop`. Before writing, the script makes a backup copy `settings.json.<date>.bak` once a day; it leaves a file with comments or invalid JSON untouched.

For `claude` run from a terminal in this repository: `pnpm dev:link` — the same variables go into `mise.local.toml` (local, in .gitignore), and mise sets them when you enter the folder. Template: `mise.local.toml.example`.

### Alongside installed plugins

The repository only **adds** mod folders to what is already loaded: installed plugins (`enabledPlugins`), marketplaces, `pluginConfigs`, and `~/.claude/skills` are left unchanged, and other entries in `CLAUDE_CODE_PLUGIN_DIRS` are preserved. `pnpm dev:status` shows everything loaded besides the repository, along with name conflicts. `dev:link` skips a mod that has the same name as an installed and enabled plugin (it would otherwise load twice), and `pnpm new` rejects such a name.

### Edit loop

1. `pnpm watch my-mod` in a terminal — typecheck and tests on every save.
2. Edit `plugins/my-mod/hooks/*` → an open Desktop session reloads the mod by itself.
3. Load problems appear as a dim line in the transcript; for details, use `claude --debug`.

### Engine types

`types/engine/` holds the API declarations of the installed Claude Code version. It is generated, not committed: run `pnpm types:sync` after cloning (before `pnpm check`) and after every Claude Code update. `pnpm check` warns if the versions diverge. The engine writes the declarations when it loads a mod from a folder (`claude --plugin-dir plugins/ref-pane`, or any session with the mods linked), so load one mod once before the first sync.

For details on the structure and runtime constraints, see [AGENTS.md](AGENTS.md) (CLAUDE.md only imports it).
