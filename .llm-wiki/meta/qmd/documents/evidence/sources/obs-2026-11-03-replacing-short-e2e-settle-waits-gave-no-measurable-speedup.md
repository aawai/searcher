---
type: source
title: "Observation: Replacing short E2E settle waits gave no measurable speedup"
tags:
  - e2e
  - performance
  - fixed-wait
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-replacing-short-e2e-settle-waits-gave-no-measurable-speedup
relevance: medium
observed_at: 2026-11-03T04:16:07.686Z
source_context: E2E duration audit 2026-11-03
---

# 🔍 Observation: Replacing short E2E settle waits gave no measurable speedup

home-notes-placement/resize 14x waitForTimeout(300) (cover --motion-base 200ms left/top transition before geometry) replaced by 'three stable frames, no running note animation': 3 focused + 3 suite rounds passed but placement 15.2 -> 14.9s (noise). library-windows.test.ts:617 600ms (smooth scroll-behavior settle) replaced by scroll-stop condition: passed, gain <1s indistinguishable. Both reverted. Lesson: short fixed settle waits near the real animation duration are not worth churn; remaining fixed waits in workspace/documents are input holds (touch long-press/TouchSensor delay) or negative observation windows (1800ms = AUTOSAVE_DEBOUNCE_MS 1500 + 300, 300-400ms compat-click) and are contracts.

*Relevance: medium*
*Context: E2E duration audit 2026-11-03*
*Tags: e2e performance fixed-wait*

---
*Observed: 2026-11-03T04:16:07.686Z*
