---
type: source
title: "Observation: E2E suites ordered longest-first for Deno --parallel"
tags:
  - e2e
  - performance
  - scheduling
  - deno-parallel
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-e2e-suites-ordered-longest-first-for-deno-parallel
relevance: high
observed_at: 2026-11-03T04:16:07.258Z
source_context: E2E duration audit 2026-11-03
---

# ⭐ Observation: E2E suites ordered longest-first for Deno --parallel

Deno --parallel starts test files in argument order (observed: first 4 files of workspace started together). scripts/e2e/suites.ts now lists workspace, bundle, home-notes and supplemental files by descending per-file JUnit time (jobs=4, 2026-11-03). Verified 3/3 passing rounds each with run.ts --parallel --timeout 5000: workspace test 174.4s -> 165.3/179.9/188.3 under host drift (serial sum 591 -> 622/687/718), simulated with same per-file times -15.5..-16.5s; supplemental 51.9 -> 48.7/47.1/48.6; home-notes 38.5 -> 34.9/32.8/33.7. Order only schedules; CI routing/bundle/home-notes/supplemental run serial so gains are local-parallel only (workspace CI shards keep the same sets).

*Relevance: high*
*Context: E2E duration audit 2026-11-03*
*Tags: e2e performance scheduling deno-parallel*

---
*Observed: 2026-11-03T04:16:07.258Z*
