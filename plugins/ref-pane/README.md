# ref-pane

A pane of references like RV-1 / FB-2 / T-3 from the model reply: a click shows the ticket artifact section (`features/<TICKET>/…`) right in the session.

## Install

```
/plugin marketplace add gidragir/claude-mods
/plugin install ref-pane@claude-mods
```

## Usage

- References from the model reply appear in the Refs pane automatically (the search runs in the background and does not block the turn).
- `/ref RV-1` shows the section for a reference; `/ref` without arguments opens the pane.
- `features` directories are taken from `cwd/features` and from absolute paths mentioned in the session.
- Flat project documents are searched in `docs/*.md` near cwd (cwd itself, its parent and grandparent): a table row or a heading counts as a definition (`| D-26 | … |`), a list item counts only as a mention.
- Numbers may contain letters: `Q-L1`, `Q-P21`.
- Only known artifact prefixes are recognized (by default RV, FB, T, TASK, ADR, DBG, OQ, BQ, RD, D, Q, FR, NFR, AC, US): UTF-8, SHA-256 and the like are ignored.

## Configuring prefixes

A custom set of prefixes is defined by the plugin option `prefixes`: `/config` → ref-pane → "Artifact prefixes" (or when installing the plugin). The format is `PREFIX=dir`, comma-separated:

```
RV=review, FB=feedback, BUG=bugs, ADR
```

- Prefix: 1–4 uppercase Latin letters. Anything longer than 4 letters (for example `TICKET-123`) is a ticket number, not an artifact reference.
- Dir: a subfolder of `features/<TICKET>/` where the section is looked up first; the other directories are scanned afterwards. Without `=`, the directory is the lowercase prefix (`ADR` = `ADR=adr`).
- A custom list **replaces** the default set rather than extending it: list every prefix you need. An empty value means the default set.
- Changes are picked up the next time the mod loads (a new session or a plugin reload).

## Develop

```bash
pnpm check ref-pane
```
