---
type: source
title: "Observation: Routing auth-surface steps moved from navigation to auth E2E"
tags:
  - e2e
  - performance
  - routing
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-routing-auth-surface-steps-moved-from-navigation-to-auth-e2e
relevance: medium
observed_at: 2026-11-03T04:16:07.677Z
source_context: E2E duration audit 2026-11-03
---

# 🔍 Observation: Routing auth-surface steps moved from navigation to auth E2E

web/e2e/navigation.test.ts steps 'auth surfaces retain responsive geometry in both themes' and 'auth switch links use the accent color and underline on hover' used their own guest contexts and no journey state; moved unchanged into a new Deno.test in web/e2e/auth.test.ts with its own startProductionApp fixture. routing --parallel test phase 60.7s -> 46.6s (navigation 56.8 -> 42.8s, auth 6.5 -> 20.9s), serial sum 70.8 -> 71.2s, testcases 24 -> 25 (one extra top-level wrapper). Focused + suite 1 round each passed.

*Relevance: medium*
*Context: E2E duration audit 2026-11-03*
*Tags: e2e performance routing*

---
*Observed: 2026-11-03T04:16:07.677Z*
