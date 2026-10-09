---
type: source
title: "Observation: Workspace contract regression tests and non-modal desktop verification"
tags:
  - workspace
  - e2e
  - playwright
  - regression
  - issue-36
  - desktop-non-modal
  - mobile-sheet
status: observation
created: 2026-09-30
updated: 2026-09-30
slug: obs-2026-09-30-workspace-contract-regression-tests-and-non-modal-desktop-ve
relevance: high
observed_at: 2026-09-30T15:08:48.135Z
source_context: "Issue #36 Workspace shell e2e contract regression test suite"
---

# ⭐ Observation: Workspace contract regression tests and non-modal desktop verification

Added web/e2e/workspace.test.ts and deno task test:workspace testing end-to-end Issue #36 workspace shell regressions across desktop and mobile: widgets closed dock with focus return, desktop non-modal aside without backdrop, focus trap, or layout shift, in-place root switching with preserved queries, nested AppForm dirty back/close protection and save, notes editor immediate close with local draft preservation, eventual autosave, conflict/version behaviors with real server, zen floating notes preserved desktop layout, and mobile modal sheet focus trap, swipe-down dismiss, and escape focus return. Identified and reported a stale note prop overwrite bug during resolve in NoteEditor.tsx to Main.

*Relevance: high*
*Context: Issue #36 Workspace shell e2e contract regression test suite*
*Tags: workspace e2e playwright regression issue-36 desktop-non-modal mobile-sheet*

---
*Observed: 2026-09-30T15:08:48.135Z*
