---
type: source
title: "Observation: Touch drag sensor preserves sidebar scrolling"
tags:
  - dnd-kit
  - touch
  - accessibility
  - notes-tree
status: observation
created: 2026-10-30
updated: 2026-10-30
slug: obs-2026-10-30-touch-drag-sensor-preserves-sidebar-scrolling
relevance: high
observed_at: 2026-10-30T16:08:24.602Z
source_context: Issue 352 notes tree drag UI
---

# ⭐ Observation: Touch drag sensor preserves sidebar scrolling

For the notes tree, unrestricted touch-action:none on draggable rows was rejected because it prevents normal mobile sidebar scrolling. Mouse and pen use a PointerSensor with 6px activation distance; touch uses a TouchSensor with 500ms delay and 5px tolerance so quick swipes scroll before activation. A stationary long press opens its context menu on release; a long press followed by movement drags.

*Relevance: high*
*Context: Issue 352 notes tree drag UI*
*Tags: dnd-kit touch accessibility notes-tree*

---
*Observed: 2026-10-30T16:08:24.602Z*
