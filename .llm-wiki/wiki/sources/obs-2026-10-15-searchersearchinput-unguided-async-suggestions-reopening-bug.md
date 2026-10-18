---
type: source
title: "Observation: SearcherSearchInput unguided async suggestions reopening bug"
tags:
  - searcher
  - workspace
  - e2e
  - playwright
  - suggestion-item
  - combobox
status: observation
created: 2026-10-15
updated: 2026-10-15
slug: obs-2026-10-15-searchersearchinput-unguided-async-suggestions-reopening-bug
relevance: high
observed_at: 2026-10-15T09:23:02.467Z
source_context: "Issue #167 root cause investigation on workspace.test.ts failure"
---

# ⭐ Observation: SearcherSearchInput unguided async suggestions reopening bug

Investigated workspace.test.ts:485 failure where '新建便签' was intercepted for 30s by .suggestion-item from section.hero. Proved root cause in SearcherSearchInput.tsx:286: useEffect([query, engine, mode, webApps]) unconditionally executes setIsOpen(combined.length > 0) upon async fetch return without checking if field.current === document.activeElement. When webApps changes (saving an app at line 427), the stale query 'desktop non-modal typing' triggers a new suggestion fetch, which resolves while the notes window is active and re-opens the suggestions dropdown (z-index 90 > 30), obstructing the notes button. SearcherSearchInput also lacks onBlur handler and ignores Escape when !isOpen. Confirmed genuine production defect; must not be papered over with force clicks or test query clearing.

*Relevance: high*
*Context: Issue #167 root cause investigation on workspace.test.ts failure*
*Tags: searcher workspace e2e playwright suggestion-item combobox*

---
*Observed: 2026-10-15T09:23:02.467Z*
