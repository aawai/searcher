---
type: source
title: "Observation: NotesWorkspace inline expand, deduplication, and hit-testable drag grip guard"
tags:
  - workspace
  - notes
  - issue-43
  - expand
  - deduplication
  - drag-handle
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-notesworkspace-inline-expand-deduplication-and-hit-testable-
relevance: high
observed_at: 2026-10-01T06:00:00.588Z
source_context: "Issue #43 Notes Workspace Root inline expand and geometry fix"
---

# ⭐ Observation: NotesWorkspace inline expand, deduplication, and hit-testable drag grip guard

Implemented Issue #43 in NotesWorkspace.tsx and notes-workspace.css without modifying NoteCard.tsx. Maintained in-memory expandedIds local Set state for inline expansion without writing note layout, version, or autosave. Added mutual exclusivity: fixed notes (isPinned || isHomeFixed) appear under #notes-fixed-heading and are excluded from #notes-other-heading when query is empty; search query evaluates once over all notes under #notes-all-heading without rendering fixed section. Fixed right-side void by setting card width to 100% and box-sizing: border-box under .notes-workspace list scope (width difference <= 2px). Resolved P2 control bug where HTML disabled on Button caused pointer-events: none to bleed clicks to enclosing .note-drag span and trigger NoteCard onOpen editor; fixed via hit-testable wrapper with role='button', enabled inert Button with aria-disabled='true', and stopPropagation across click, pointerdown, and mousedown.

*Relevance: high*
*Context: Issue #43 Notes Workspace Root inline expand and geometry fix*
*Tags: workspace notes issue-43 expand deduplication drag-handle*

---
*Observed: 2026-10-01T06:00:00.588Z*
