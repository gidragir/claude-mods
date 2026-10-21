# __MOD_NAME__

__MOD_DESCRIPTION__

This cross-model plugin supports both **Claude Code** (as a function-hook mod in TypeScript) and **Google Antigravity** (as an Auxiliary Pane webview sidecar). It provides pure domain logic shared across environments, lifecycle hooks, and interactive graphical rendering.

## Installation

### Claude Code

Install directly from the community marketplace:

```text
/plugin marketplace add gidragir/claude-mods
/plugin install __MOD_NAME__@claude-mods
```

### Antigravity

Link the plugin and sidecar into your local Antigravity environment via directory junctions:

```powershell
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\__MOD_NAME__" -Target "$PWD\plugins\__MOD_NAME__"
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\__MOD_NAME__" -Target "$PWD\plugins\__MOD_NAME__\sidecars\__MOD_NAME__"
```

## Development & Testing

```bash
# Claude Code mod validation, typecheck, and unit tests
pnpm check __MOD_NAME__

# Antigravity sidecar endpoint and SSR tests
pnpm test:sidecar

# Run all test suites
pnpm test:all
```
