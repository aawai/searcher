---
type: source
title: "Observation: Home layouts & Launcher UI Guard migration (Issue #52)"
tags:
  - ui-guard
  - design-system
  - home-layouts
  - launcher
  - bento
  - responsive
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-home-layouts-launcher-ui-guard-migration-issue-52
relevance: high
observed_at: 2026-10-01T12:14:29.216Z
source_context: "Issue #52 UI Guard stock debt migration"
---

# ⭐ Observation: Home layouts & Launcher UI Guard migration (Issue #52)

Migrated web/src/features/home-layouts/LayoutModeSelector.tsx, home-layouts.css, and web/src/components/searcher/launcher.css to canonical and semantic tokens, resolving all 154 UI Guard violations across these 3 files (106 stale allowances). Extracted LayoutModeSelector preview inline styles into static CSS classes (.layout-preview-zen-*, .layout-preview-widgets-*). Preserved responsive geometry, 5:3 Bento ratio, ControlledNotes determinism, and historical launcher CSS variables (--launcher-*) while aliasing them to semantic tokens (--space-launcher-*). Verified with check:ui (0 new, 0 increased), build, and Playwright across 390/768/1440 in light/dark with zero overflow and zero console errors.

*Relevance: high*
*Context: Issue #52 UI Guard stock debt migration*
*Tags: ui-guard design-system home-layouts launcher bento responsive*

---
*Observed: 2026-10-01T12:14:29.216Z*
