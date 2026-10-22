---
name: plugin-distribution
description: Build, link, package, and release cross-model plugins for production. Use when linking plugins locally (Claude Desktop / mise / Antigravity junctions), compiling standalone bundles with bifrost build, or configuring GitHub Actions CI/CD release workflows.
---

# Plugin Distribution & Release Guide

This skill covers linking plugins for local live development across Claude Code and Google Antigravity, compiling standalone distribution bundles, and releasing through GitHub Actions.

## 1. Local Development Linking

During development, plugins can be linked live without compilation or rebuilding:

```bash
# Check current link status across all environments
pnpm dev:status
```

### Google Antigravity Linking
Link plugin metadata and sidecar webviews into `~/.gemini/config/`:

```bash
pnpm dev:link:gemini [mod-name]
```

Or manually via PowerShell directory junctions:
```powershell
# Plugin discovery (rules, skills, metadata)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\plugins\<mod>" -Target "<repo>\plugins\<mod>"

# Sidecar discovery (Auxiliary Pane HTTP server)
New-Item -ItemType Junction -Path "$HOME\.gemini\config\sidecars\<mod>" -Target "<repo>\plugins\<mod>\sidecars\<mod>"
```

### Claude Code Linking
- **Terminal Sessions (`mise`)**:
  ```bash
  pnpm dev:link [mod-name]
  ```
  Appends `CLAUDE_CODE_PLUGIN_DIRS` to `mise.local.toml`.
- **Claude Desktop**:
  ```bash
  pnpm dev:link:desktop [mod-name]
  ```
  Appends paths to `~/.claude/settings.json` (restart Claude Desktop to take effect).
- **Marketplace Clash Resolution**:
  If the plugin is already cached from a marketplace (`~/.claude/plugins/cache/`), temporarily disable it:
  ```bash
  claude plugin disable <mod-name>
  ```

---

## 2. Standalone Production Bundling (`bifrost build`)

Plugins installed by end users via the Claude Code Marketplace or Antigravity Extensions UI are extracted into isolated standalone directories without monorepo dependencies.

Compile self-contained bundles using the Bifrost CLI compiler:

```bash
bun x bifrost build plugins/<mod-name>
```

### What `bifrost build` does:
1. **Bundles Claude Code entry**: Generates `dist/claude.js` using `esbuild` with inlined Bifrost adapters (< 50KB).
2. **Bundles Sidecar server**: Generates `dist/sidecar.mjs` with inlined routing and SSR markdown (< 50KB).
3. **Bundles Webview assets**: Inlines or copies Pico CSS and client scripts into `dist/index.html`.
4. **Non-Destructive Manifest Synchronization**:
   - Updates `plugin.json` and `.claude-plugin/plugin.json`.
   - Merges `mod.config.ts`'s `configSchema` into `userConfig`.
   - Strictly preserves existing user configurations, custom types, descriptions, and suggested prompts.

---

## 3. GitHub Actions CI/CD Pipeline

The repository includes automated GitHub Actions workflows in `.github/workflows/`:

### 1. Framework Release (`publish-framework.yml`)
- **Trigger**: Tag push matching `framework-v*` (e.g. `framework-v0.1.0`).
- **Steps**:
  1. Installs dependencies and runs `bun test`.
  2. Runs `bun run build` to compile framework and emit `.d.ts` types.
  3. Publishes `@gidragir/bifrost` to GitHub Packages npm registry using `secrets.GITHUB_TOKEN`.

### 2. Plugin Release (`release-plugins.yml`)
- **Trigger**: Tag push matching `<plugin>-v*` (e.g. `ref-pane-v0.3.0`).
- **Critical Invariant**:
  - The workflow packages the pre-compiled standalone plugin into an archive (`<plugin>-v*.tar.gz`) attached to the GitHub Release.
  - It checks out an orphan git branch `release/<plugin-name>` and pushes compiled files **directly at repository root**.
  - Placing files at the root ensures that native installation works:
    ```bash
    claude plugin install <owner>/<repo>#release/<plugin-name>
    ```
