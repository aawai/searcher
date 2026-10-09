---
type: source
title: "Observation: Issue #136 Notes focus boundary merged via PR #137"
tags:
  - notes
  - focus
  - save
  - issue-136
  - pr-137
  - regression
  - worktree
status: observation
created: 2026-10-08
updated: 2026-10-08
slug: obs-2026-10-08-issue-136-notes-focus-boundary-merged-via-pr-137
relevance: high
observed_at: 2026-10-08T07:52:13.619Z
source_context: "Issue #136 implementation and authorized PR merge"
---

# ⭐ Observation: Issue #136 Notes focus boundary merged via PR #137

Implemented in isolated worktree /home/aawei/searcher-worktrees/issue-136 without subagents. PR https://github.com/aawai/searcher/pull/137 merged into main at 19c5f3a43eaf164aabf8b0d0e72ac5a6c4af310d; Issue #136 confirmed CLOSED. NoteEditor now uses one instance-local deferred blur handler with marked title/body/toolbar regions and mode-switch exception, latest draft/accepted-note/composition refs, and unmount timer cancellation. Internal focus does not save/reset debounce; dirty real leave manual flushes; explicit save/backend policies unchanged. Title composition guard added. New notes-focus production E2E covers real PATCH/version/history, restored dirty draft, retry, old title response preserving newer body after immediate close, and two-instance isolation. Red observed clean title->Live body manual PATCH; Green 14 steps. Unit suite 640 tests/51 steps; workspace 11 tests/105 steps; affected typecheck/lint/format, UI and bundle gates passed. Six 390/768/1440 light/dark production screenshots plus CDP title Chinese IME and actual Widgets multiwindow smoke completed. Full-repo lint retains 9 diagnostics in untouched api/local/search files; full fmt fails untouched WORKSPACE_FINAL_REFACTOR_PLAN.md and ui-guard/baseline.json. GitHub token cannot read statusCheckRollup; remote CI result not claimed. README/DESIGN_SYSTEM/MARKDOWN_EDITOR/UI_REVIEW_CHECKLIST/CHANGELOG and existing Notes CI/task updated.

*Relevance: high*
*Context: Issue #136 implementation and authorized PR merge*
*Tags: notes focus save issue-136 pr-137 regression worktree*

---
*Observed: 2026-10-08T07:52:13.619Z*
