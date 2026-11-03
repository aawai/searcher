---
type: source
title: "Observation: Documents page-mode keyboard selection fails under changed concurrency"
tags:
  - e2e
  - documents
  - flaky
  - pagination
  - selection
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-documents-page-mode-keyboard-selection-fails-under-changed-c
relevance: high
observed_at: 2026-11-03T04:16:07.683Z
source_context: E2E duration audit 2026-11-03
---

# ⭐ Observation: Documents page-mode keyboard selection fails under changed concurrency

Reordering documents-core longest-first (document-vertical-layout, documents-library, documents-drafts, host-boundaries, presentation-contracts start together at jobs=4) failed 2 of 3 rounds: document-vertical-layout.test.ts:620 empty selection after click paragraph + Home + Shift+ArrowRight in page mode; document-presentation-contracts.test.ts:928 selection length 4 instead of 6 after click + End + 6x Shift+ArrowLeft in page mode. Baseline order passed its single round. Root cause (product reflow vs test readiness) undetermined; order reverted, not rerun, assertions untouched. Simulated gain if fixed: ~23s per documents-core parallel run.

*Relevance: high*
*Context: E2E duration audit 2026-11-03*
*Tags: e2e documents flaky pagination selection*

---
*Observed: 2026-11-03T04:16:07.683Z*
