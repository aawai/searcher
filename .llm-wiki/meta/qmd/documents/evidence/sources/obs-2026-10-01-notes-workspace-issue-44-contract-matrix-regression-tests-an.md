---
type: source
title: "Observation: Notes workspace Issue #44 contract matrix regression tests and visual evidence"
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-notes-workspace-issue-44-contract-matrix-regression-tests-an
relevance: high
observed_at: 2026-10-01T07:53:53.030Z
---

# ⭐ Observation: Notes workspace Issue #44 contract matrix regression tests and visual evidence

Implemented independent web/e2e/notes-workspace.test.ts covering all #44 and #43 Notes contracts using production API harness mode (Deno.serve + in-memory SQLite + AuthService + Chromium): 1. No notes & search no result empty states; 2. Fixed section mutual exclusivity and search deduplication; 3. Controls isolation (drag handle, expand, collapse, pin/home-fixed/color dropdown do not enter editor); 4. Inline expand/collapse, fullwidth card geometry within 2px tolerance, and API write purity (zero mutations to layout/version); 5. NoteEditor saving, unsynced, error, and retry lifecycle; 6. NoteEditor 409 conflict detection, alert dialog with remote/local diff, and use-cloud / overwrite resolutions; 7. Version history error alert handling; 8. Stale cached notes browse and retry on server 500 outage; 9. Long title (120+ char) and 16+ notes overflow contract across desktop (1440x900) and mobile (390x844) light/dark without horizontal overflow; 10. Zen FloatingNotes position stability across opening/closing workspace; 11. ControlledNotes deterministic spatial layout (z-index cascade, stable tilt) and mobile <=767px flex single-column fallback; 12. Fresh screenshots captured for desktop workspace, mobile sheet, note editor, conflict dialog, and controlled notes.

*Relevance: high*

---
*Observed: 2026-10-01T07:53:53.030Z*
