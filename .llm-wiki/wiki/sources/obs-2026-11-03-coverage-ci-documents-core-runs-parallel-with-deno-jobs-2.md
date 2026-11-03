---
type: source
title: "Observation: Coverage CI documents-core runs --parallel with DENO_JOBS=2"
tags:
  - e2e
  - ci
  - documents
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-coverage-ci-documents-core-runs-parallel-with-deno-jobs-2
relevance: medium
observed_at: 2026-11-03T05:10:40.274Z
source_context: E2E duration audit follow-up 2026-11-03
---

# 🔍 Observation: Coverage CI documents-core runs --parallel with DENO_JOBS=2

.github/workflows/e2e-coverage.yml now sets E2E_SCHEDULE to --parallel for matrix.suite == documents-core and --serial for the six other jobs, with DENO_JOBS=2. Local check with the CI configuration (no --timeout, DENO_JOBS=2): documents-core passed, build 9.3s, test 170.6s, wall 180.0s; not yet measured on GitHub runners. Pagination CI stays four separate jobs (user decision).

*Relevance: medium*
*Context: E2E duration audit follow-up 2026-11-03*
*Tags: e2e ci documents*

---
*Observed: 2026-11-03T05:10:40.274Z*
