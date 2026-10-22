---
name: releasing
description: Use when asked to release, publish or tag a plugin or the Bifrost framework in this repository, to bump versions, push release tags (<mod>-v*, framework-v*), or when a Release Plugins / Publish Bifrost Framework run on GitHub failed.
---

# Releasing plugins and the framework

**Core principle:** a tag is a public, irreversible trigger. CI runs on a clean checkout that differs from
this machine (no `types/engine`, no `dist`, no `node_modules`, Linux, `bun install`), so local green is
not proof. Prove the release on a clean clone and with the workflows accepted **before** any tag leaves
the machine.

## What ships where

| Target | Version lives in | Tag | Workflow | Result |
| --- | --- | --- | --- | --- |
| plugin `<mod>` | `version` in `plugins/<mod>/src/plugin.tsx` | `<mod>-v<version>` | `release-plugins.yml` | orphan branch `release/<mod>` |
| framework | `packages/bifrost/package.json` + `## <version>` in its `CHANGELOG.md` | `framework-v<version>` | `publish-framework.yml` | `@gidragir/bifrost` on GitHub npm |

`.claude-plugin/marketplace.json` points at `release/<mod>` and carries each plugin's version.

## Procedure

1. **Bump.** Every target whose files changed since its last tag gets a new version (`git tag -l '<mod>-v*'`).
   Framework: move `Unreleased` in `CHANGELOG.md` into `## <version>`. Plugins: `pnpm marketplace`.
2. **Commit.** One scope per commit (`feat(bifrost)`, `feat(<mod>)`, `build`, `ci`), then the release commit
   (`release: <mod> <version>, …`) **last**: fixes found later go before a new release commit, not after it.
3. **`pnpm release:check`** until it prints `Ready`. It replays the CI steps on a clean clone of HEAD, checks
   versions against tags, the CHANGELOG section and marketplace.json, and runs actionlint when installed. It
   prints the tags to push.
4. **Push `main` alone**, wait ~20 s, `gh run list -L 5`. A run that failed in 0 s with "This run likely failed
   because of a workflow file issue" means GitHub rejected a workflow: fix it, back to step 3.
5. **Push the tags** printed in step 3 (`git tag -a <tag> -m …`, `git push origin <tags>`).
6. **Verify the result, not the run:**
   - plugin: `gh api "repos/gidragir/claude-mods/contents/.claude-plugin/plugin.json?ref=release/<mod>" --jq .content | base64 -d` shows the new version;
   - framework: `gh run view <id> --log | grep "+ @gidragir/bifrost@"`.

## When a release run fails after the tags are pushed

Do not move, delete or re-push a tag. Fix on `main`, run `pnpm release:check`, push `main`, then rebuild
from `main`: `gh workflow run release-plugins.yml -f plugin=<mod>` or `gh workflow run publish-framework.yml`.
Tell the user the release was built from `main`, not from the tag.

## Known CI traps

| Symptom | Cause |
| --- | --- |
| `build.mjs`: `Cannot find module 'claude-code'` | engine types are local only; the build must not need `types/engine` |
| run fails in 0 s, "workflow file issue" | invalid workflow, e.g. `matrix.*` in a job-level `if` |
| `with:` gets the literal `$VAR` | `with:` takes `${{ env.VAR }}`, not shell variables |
| a step reads repo files before `actions/checkout` | order of steps |

## Red flags: stop

- "Tests pass locally, tag it": run `pnpm release:check`.
- Pushing `main` and tags in one command.
- "The run is green": check the release branch or the published version.
- Re-pointing a pushed tag to "fix" a release.
