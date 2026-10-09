---
type: source
title: "Observation: Ask workspace CSS normalized to semantic tokens"
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-ask-workspace-css-normalized-to-semantic-tokens
relevance: high
observed_at: 2026-10-01T01:22:45.160Z
---

# ⭐ Observation: Ask workspace CSS normalized to semantic tokens

Normalized web/src/features/ask/ask-workspace.css to canonical tokens, eliminating undefined variables (--font-title-size -> --font-page-title-size, --radius-lg -> --search-radius, --font-mono -> --font-code-family, raw control height fallback -> --control-compact-height) and raw colors/geometry. Fixed jump-to-latest button overlaying composer textarea by anchoring inside composer dock with dynamic bottom: calc(100% + var(--space-2)). Fixed sidebar history title text clipping on left by enforcing block left-aligned layout on .ask-sidebar__item-title and wrapping item title in truncated span. Bound attachment names, applied responsive containment (sourcegrid minmax(min(220px, 100%), 1fr), mobile useredit minwidth 0), and applied --control-touch-target (44px) across all essential mobile targets. All 31 ask tests pass and check:ui passes with 0 drift.

*Relevance: high*

---
*Observed: 2026-10-01T01:22:45.160Z*
