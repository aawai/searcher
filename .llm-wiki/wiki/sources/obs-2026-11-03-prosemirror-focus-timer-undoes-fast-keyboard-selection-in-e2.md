---
type: source
title: "Observation: ProseMirror focus timer undoes fast keyboard selection in E2E"
tags:
  - e2e
  - prosemirror
  - flaky
  - selection
  - documents
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-prosemirror-focus-timer-undoes-fast-keyboard-selection-in-e2
relevance: high
observed_at: 2026-11-03T05:10:39.842Z
source_context: E2E duration audit follow-up 2026-11-03
---

# ⭐ Observation: ProseMirror focus timer undoes fast keyboard selection in E2E

Root cause of documents page-mode selection failures (document-presentation-contracts.test.ts:928, document-vertical-layout.test.ts:620): when the editor gains focus, prosemirror-view's focus handler schedules setTimeout(20ms) and, if the DOM selection differs from domObserver.currentSelection, calls selectionToDOM with its state selection. Under CPU load the timer fired 75ms+ after the click, after native Shift+ArrowLeft had extended the selection, so the selection was written back (6 -> 2/3/4 chars). Traced via Selection.collapse/extend stacks into editor-vendor (qe = selectionToDOM from ie.focus). No pagination decoration reflow and no app focus() calls were involved. Fix (test readiness, not product): web/e2e/helpers/library.ts clickIntoEditor(target) clicks then awaits an in-page setTimeout(20) ordering barrier; used at 7 click-then-key sites in presentation-contracts, vertical-layout and documents.test. Same 4-file DENO_JOBS=4 contention: before 10/19 rounds failed, after 5/5 passed.

*Relevance: high*
*Context: E2E duration audit follow-up 2026-11-03*
*Tags: e2e prosemirror flaky selection documents*

---
*Observed: 2026-11-03T05:10:39.842Z*
