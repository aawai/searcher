---
type: source
title: "Observation: Bundle E2E split: route-style-admin-lab file"
tags:
  - e2e
  - performance
  - bundle
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-bundle-e2e-split-route-style-admin-lab-file
relevance: medium
observed_at: 2026-11-03T04:16:07.681Z
source_context: E2E duration audit 2026-11-03
---

# 🔍 Observation: Bundle E2E split: route-style-admin-lab file

The four independent Deno.tests at the end of web/e2e/route-style-stability.test.ts (Design Lab composition geometry, admin backup colours, admin user table labels, admin audit object ID) moved unchanged to web/e2e/route-style-admin-lab.test.ts, registered in suites.ts bundle. bundle --parallel test 52.1s -> 32.0/30.2/30.8s over 3 passing rounds; testcases 24 = 24. docs/design/VISUAL_LANGUAGE.md now cites the new file for Design Lab geometry and coarse-pointer targets.

*Relevance: medium*
*Context: E2E duration audit 2026-11-03*
*Tags: e2e performance bundle*

---
*Observed: 2026-11-03T04:16:07.681Z*
