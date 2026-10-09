---
type: source
title: "Observation: Preferences API and schema migration for Issue #55 ambient wallpaper fields"
tags:
  - preferences
  - db
  - migration
  - ambient-wallpaper
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-preferences-api-and-schema-migration-for-issue-55-ambient-wa
relevance: high
observed_at: 2026-10-01T14:11:16.581Z
source_context: "Issue #55 backend implementation"
---

# ⭐ Observation: Preferences API and schema migration for Issue #55 ambient wallpaper fields

Implemented schema changes and Drizzle migration 0016_same_unus for Issue #55: added wallpaperGlowStrength (0.00-0.30, default 0.14), ambientMotionMode ('off' | 'breathe' | 'breathe_ripple', default 'breathe_ripple'), ambientMotionStrength (0.00-1.00, default 0.35), updated wallpaperMask default to 0.36. Ensured first partial PATCH inserts full canonical defaults (including system default engine/theme/target), while conflict updates patch only. Preserved existing wallpaper_mask=0 on legacy rows.

*Relevance: high*
*Context: Issue #55 backend implementation*
*Tags: preferences db migration ambient-wallpaper*

---
*Observed: 2026-10-01T14:11:16.581Z*
