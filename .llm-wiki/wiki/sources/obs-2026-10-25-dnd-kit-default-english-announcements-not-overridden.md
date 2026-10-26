---
type: source
title: "Observation: dnd-kit default English announcements not overridden"
tags:
  - accessibility
  - dnd-kit
  - home-notes
status: observation
created: 2026-10-25
updated: 2026-10-25
slug: obs-2026-10-25-dnd-kit-default-english-announcements-not-overridden
relevance: medium
observed_at: 2026-10-25T08:04:51.476Z
source_context: wiki-run 2026-10-25 ingesting dnd-kit accessibility guide
---

# 🔍 Observation: dnd-kit default English announcements not overridden

Both DndContext usages (web/src/features/home-layouts/HomeNotes.tsx and web/src/features/app-library/WebAppLauncher.tsx) pass no `accessibility` prop. @dnd-kit/core 6.3.1 (core.esm.js) always renders default English screenReaderInstructions and live-region announcements such as "Picked up draggable item " + active.id. Home note ids are UUIDs, and HomeNotes already maintains its own Chinese role=status live region, so pointer drags may announce English+UUID alongside the custom text. Inferred from library source; not verified with a screen reader. Fix direction: pass localized accessibility.announcements/screenReaderInstructions to DndContext.

*Relevance: medium*
*Context: wiki-run 2026-10-25 ingesting dnd-kit accessibility guide*
*Tags: accessibility dnd-kit home-notes*

---
*Observed: 2026-10-25T08:04:51.476Z*
