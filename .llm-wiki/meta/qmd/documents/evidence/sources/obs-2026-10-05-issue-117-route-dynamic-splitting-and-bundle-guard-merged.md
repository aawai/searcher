---
type: source
title: "Observation: Issue #117: Route dynamic splitting and bundle guard merged"
tags:
  - performance
  - bundle-splitting
  - bundle-guard
  - e2e
status: observation
created: 2026-10-05
updated: 2026-10-05
slug: obs-2026-10-05-issue-117-route-dynamic-splitting-and-bundle-guard-merged
relevance: high
observed_at: 2026-10-05T12:56:22.741Z
source_context: "Resolving Issue #117"
---

# ⭐ Observation: Issue #117: Route dynamic splitting and bundle guard merged

Resolved issue #117 via worktree. Implemented route-level dynamic code splitting with React.lazy, dynamic NoteMarkdownLoader, conditional WallpaperMotionInspector injection, and function-based manualChunks mapping. Added scripts/check-bundle.ts, scripts/bundle-budget.json, .github/workflows/bundle-guard.yml, and web/e2e/bundle-loading.test.ts. Baseline initial JS reduced from 1463.8 kB raw / 439.4 kB gzip to 778.6 kB raw / 242.7 kB gzip (-44.77% gzip reduction, meeting the >=30% gate). PR #119 merged into main, issue #117 closed.

*Relevance: high*
*Context: Resolving Issue #117*
*Tags: performance bundle-splitting bundle-guard e2e*

---
*Observed: 2026-10-05T12:56:22.741Z*
