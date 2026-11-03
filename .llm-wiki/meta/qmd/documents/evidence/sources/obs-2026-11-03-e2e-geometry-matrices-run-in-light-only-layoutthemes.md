---
type: source
title: "Observation: E2E geometry matrices run in light only (layoutThemes)"
tags:
  - e2e
  - performance
  - theme
  - rule
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-e2e-geometry-matrices-run-in-light-only-layoutthemes
relevance: high
observed_at: 2026-11-03T05:10:40.270Z
source_context: E2E duration audit follow-up 2026-11-03
---

# ⭐ Observation: E2E geometry matrices run in light only (layoutThemes)

User-approved rule (docs/testing.md #主题维度): geometry/behaviour E2E assertions run in light; theme-dependent colour/contrast/focus-ring/material assertions keep both themes (accent-contrast, workspace-matrix Matrix A, auth switch-link accent, admin semantic colours). web/e2e/helpers/evidence.ts layoutThemes() returns ['light'] or ['light','dark'] when E2E_EVIDENCE_DIR is set (dark only for review screenshots). Applied in apps-density (touch + desktop matrices), workspace-shell (two loops), documents.test.ts viewport matrix, inline-ai-answer screenshot step, ui-ownership overflow step, auth surfaces geometry. Back-to-back A/B at DENO_JOBS=2: apps-density 58.3 -> 48.1s, workspace-shell 42.3 -> 34.2s; suite runs: inline-ai-answer ~44 -> 32.6s, ui-ownership ~21 -> 15.2s, auth 20.9 -> 16.1s; all suites passed.

*Relevance: high*
*Context: E2E duration audit follow-up 2026-11-03*
*Tags: e2e performance theme rule*

---
*Observed: 2026-11-03T05:10:40.270Z*
