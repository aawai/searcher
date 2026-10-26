---
type: source
title: "Observation: feat/workspace-dock pushed; PR 311 created with GITHUB_TOKEN from bashrc"
tags:
  - git
  - pr
  - github
  - workspace-dock
  - ci
status: observation
created: 2026-10-26
updated: 2026-10-26
slug: obs-2026-10-26-feat-workspace-dock-pushed-pr-311-created-with-github-token-
relevance: high
observed_at: 2026-10-26T09:24:58.519Z
source_context: Creating PR and merging feat/workspace-dock into main
---

# ⭐ Observation: feat/workspace-dock pushed; PR 311 created with GITHUB_TOKEN from bashrc

Committed all uncommitted files as d4cf183 on branch feat/workspace-dock (from main), pushed to origin, and created PR #311 into main. gh was unauthenticated until GH_TOKEN was derived from GITHUB_TOKEN exported in ~/.bashrc (user-confirmed; read via bash -ic, value never printed). Verification before commit: deno task test 827 passed; check:ui 0 violations; fmt pass; lint has 1 pre-existing require-await error in src/db/database.ts:70 not in this diff. PR 311 CI checks were queued/pending at creation; mergeStateStatus UNSTABLE; merge deferred until checks finish.

*Relevance: high*
*Context: Creating PR and merging feat/workspace-dock into main*
*Tags: git pr github workspace-dock ci*

---
*Observed: 2026-10-26T09:24:58.519Z*
