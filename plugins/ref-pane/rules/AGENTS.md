# Artifact Reference Standards

When analyzing tasks, review findings, feedback items, or architecture decision records, identify sections using standard prefix tags:

- `RV-<n>`: Code review findings (e.g. `RV-1`, `RV-2`)
- `FB-<n>`: User and system feedback
- `T-<n>`: Tasks and checklist action items
- `ADR-<n>`: Architectural decision records
- `DBG-<n>`: Debugging hypotheses and logs
- `AC-<n>`: Acceptance criteria
- `US-<n>`: User stories

When discussing or surfacing artifacts with these identifiers, reference them with the exact prefix and numeric identifier so that the `ref-pane` plugin and sidecar can automatically detect, resolve, and display them in the Auxiliary Pane.
