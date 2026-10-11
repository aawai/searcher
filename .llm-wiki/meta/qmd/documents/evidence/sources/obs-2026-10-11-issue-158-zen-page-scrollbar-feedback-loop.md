---
type: source
title: "Observation: Issue 158 Zen page scrollbar feedback loop"
tags:
  - documents
  - zen
  - pagination
  - scrollbar
  - issue158
status: observation
created: 2026-10-11
updated: 2026-10-11
slug: obs-2026-10-11-issue-158-zen-page-scrollbar-feedback-loop
relevance: high
observed_at: 2026-10-11T14:33:36.555Z
source_context: "Fixing issue #158 in isolated worktree"
---

# ⭐ Observation: Issue 158 Zen page scrollbar feedback loop

In worktree /home/aawei/searcher/.worktrees/issue-158, base 068b104, classic-scrollbar Chromium (ignoreDefaultArgs --hide-scrollbars) at 1024x1552 reproduces idle jitter: 120 reflows in 2 seconds, available width 851↔866px and zoom 1↔0.991558. Independent Red test committed b7965ca. Minimal page-only scrollbar-gutter:stable on document-editor-scroll-area removes width/height feedback; 0 idle reflows and constant paper geometry. No Host overflow, pagination engine, selection, or autosave changes required. Standard headless Chromium hides scrollbars and initially missed this boundary. Synthetic evidence published on evidence/issue-158-scrollbar-stability; user private recording never published. Final full Documents regression still running; PR not yet merged.

*Relevance: high*
*Context: Fixing issue #158 in isolated worktree*
*Tags: documents zen pagination scrollbar issue158*

---
*Observed: 2026-10-11T14:33:36.555Z*
