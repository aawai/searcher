---
type: source
title: "Observation: AskPage streaming lifecycle extracted to useAskStream hook"
tags:
  - ask
  - streaming
  - refactor
  - issue-38
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-askpage-streaming-lifecycle-extracted-to-useaskstream-hook
relevance: high
observed_at: 2026-10-01T01:09:02.440Z
source_context: Issue 38 AskPage decomposition
---

# ⭐ Observation: AskPage streaming lifecycle extracted to useAskStream hook

Refactored AskPage.tsx (~885 lines down to 587 lines) by extracting the streaming request lifecycle, SSE parsing, and Searcher backend reconciliation into web/src/features/ask/useAskStream.ts. Preserved caller generationEpoch switching guards, draft restoration on failure, live token updates, and abort snapshot preservation (via shouldApplyCanonicalConversation) so partial answers are not overwritten while backend persistence is still in-flight. Added 8 unit tests in useAskStream.test.ts (total 35 ask feature tests passing).

*Relevance: high*
*Context: Issue 38 AskPage decomposition*
*Tags: ask streaming refactor issue-38*

---
*Observed: 2026-10-01T01:09:02.440Z*
