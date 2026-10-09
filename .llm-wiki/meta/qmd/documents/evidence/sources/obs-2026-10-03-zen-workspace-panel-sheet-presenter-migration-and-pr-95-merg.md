---
type: source
title: "Observation: Zen workspace panel/sheet presenter migration and PR #95 merged"
tags:
  - workspace
  - zen
  - presenter
  - issue-87
  - focus
  - ui-contract
status: observation
created: 2026-10-03
updated: 2026-10-03
slug: obs-2026-10-03-zen-workspace-panel-sheet-presenter-migration-and-pr-95-merg
relevance: high
observed_at: 2026-10-03T16:24:45.206Z
source_context: "Issue #87 Zen workspace migration to unified panel/sheet presenter"
---

# ⭐ Observation: Zen workspace panel/sheet presenter migration and PR #95 merged

Issue #87 resolved. Zen workspace migrated to unified WorkspaceSurface (panel >=768, modal sheet <768). Preserved edge trigger, FloatingNotes and note_layouts without desktop window/dock geometry. Fixed opener focus restoration in WorkspaceShell to return focus to the actual opening trigger across internal view switches. Fixed Base UI DialogPopup focus restoration collision on mobile Sheet Back -> Root navigation via synchronous layout effect chrome focusing. Full verification passed: deno task test (382 tests), deno task test:workspace (7 suites, 77 steps), deno task check:ui (101 files, 0 violations), and visual checks across 8 responsive/theme combinations. PR #95 squash merged into main; Issue #87 closed.

*Relevance: high*
*Context: Issue #87 Zen workspace migration to unified panel/sheet presenter*
*Tags: workspace zen presenter issue-87 focus ui-contract*

---
*Observed: 2026-10-03T16:24:45.206Z*
