---
type: source
title: "Observation: Widgets spatial desktop Bento and ControlledNotes deterministic layout implementation"
tags:
  - ui
  - widgets
  - bento
  - controlled-notes
  - responsive
  - layout
status: observation
created: 2026-09-30
updated: 2026-09-30
slug: obs-2026-09-30-widgets-spatial-desktop-bento-and-controllednotes-determinis
relevance: high
observed_at: 2026-09-30T14:20:38.986Z
source_context: "Issue #36 Phase 5/6/7 Widgets spatial desktop refactoring"
---

# ⭐ Observation: Widgets spatial desktop Bento and ControlledNotes deterministic layout implementation

Refactored WidgetsLayout.tsx and home-layouts.css according to Issue #36 Phase 5/6/7. Removed legacy title buttons, panel buttons, apps management chrome, and floating dock. Added ControlledNotes.tsx with controlledNotesLayout.ts providing deterministic spatial layout (max 5 notes, stable tilt, slight horizontal wander, vertical cascade, z-order, zero writes to note_layouts, and narrow container degradation). Apps quick launcher uses WebAppLauncher presentation='quick' with onManage. Bento grid updated to 5:3 container query ratio with automatic expansion when counterpart widget is empty, and centered apps balancing for 1-3 items. 9 unit tests passing.

*Relevance: high*
*Context: Issue #36 Phase 5/6/7 Widgets spatial desktop refactoring*
*Tags: ui widgets bento controlled-notes responsive layout*

---
*Observed: 2026-09-30T14:20:38.986Z*
