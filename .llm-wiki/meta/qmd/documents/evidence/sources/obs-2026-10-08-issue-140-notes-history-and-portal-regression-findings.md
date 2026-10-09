---
type: source
title: "Observation: Issue 140 Notes history and Portal regression findings"
tags:
  - notes
  - issue-140
  - focus
  - history
  - worktree
status: observation
created: 2026-10-08
updated: 2026-10-08
slug: obs-2026-10-08-issue-140-notes-history-and-portal-regression-findings
relevance: high
observed_at: 2026-10-08T14:43:26.344Z
source_context: "Implementing issue #140"
---

# ⭐ Observation: Issue 140 Notes history and Portal regression findings

Issue #140 is being implemented without subagents in /tmp/searcher-issue-140 on fix/140-notes-ux from origin/main 4cd7cbd. Main checkout has user-owned Wiki and .omp plan changes; do not include them in product commits. Baseline deno task test passed 640 tests/51 steps. Browser E2E requires LD_LIBRARY_PATH=/tmp/searcher-browser-libs/usr/lib/x86_64-linux-gnu. New production regressions exposed Escape bubbling from format-menu Portals to WorkspaceSurface and requestAnimationFrame selection restoration interfering with immediate Source fill after leaving history; fixing via scoped Portal propagation handling and layout-effect restoration. Issue/PR not yet closed or merged; full acceptance still in progress.

*Relevance: high*
*Context: Implementing issue #140*
*Tags: notes issue-140 focus history worktree*

---
*Observed: 2026-10-08T14:43:26.344Z*
