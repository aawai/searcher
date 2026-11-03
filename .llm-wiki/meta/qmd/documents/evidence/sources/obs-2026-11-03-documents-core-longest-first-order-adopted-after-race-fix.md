---
type: source
title: "Observation: documents-core longest-first order adopted after race fix"
tags:
  - e2e
  - performance
  - documents
  - scheduling
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-documents-core-longest-first-order-adopted-after-race-fix
relevance: medium
observed_at: 2026-11-03T05:10:40.266Z
source_context: E2E duration audit follow-up 2026-11-03
---

# 🔍 Observation: documents-core longest-first order adopted after race fix

With clickIntoEditor in place, scripts/e2e/suites.ts documents list is ordered longest-first (document-vertical-layout, documents-library, documents-drafts, host-boundaries, presentation-contracts, pagination x4, ...). documents-core run.ts --parallel --timeout 5000 jobs=4: baseline test 129.5s -> 109.5/106.6/106.0s over 3 passing rounds (testcases 69 -> 65 because documents.test.ts dark viewport steps were removed by the single-theme rule). Routing order also set to navigation, auth, share, guest-ai-auth (no effect at jobs=4 with 4 files).

*Relevance: medium*
*Context: E2E duration audit follow-up 2026-11-03*
*Tags: e2e performance documents scheduling*

---
*Observed: 2026-11-03T05:10:40.266Z*
