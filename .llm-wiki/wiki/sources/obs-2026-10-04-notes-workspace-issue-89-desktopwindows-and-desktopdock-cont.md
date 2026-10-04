---
type: source
title: "Observation: Notes workspace Issue #89 DesktopWindows and DesktopDock contract migration"
tags:
  - notes-workspace
  - e2e
  - desktop-dock
  - desktop-windows
  - contracts
status: observation
created: 2026-10-04
updated: 2026-10-04
slug: obs-2026-10-04-notes-workspace-issue-89-desktopwindows-and-desktopdock-cont
relevance: high
observed_at: 2026-10-04T00:40:42.559Z
source_context: "Issue #89 migration of Notes workspace e2e tests"
---

# ⭐ Observation: Notes workspace Issue #89 DesktopWindows and DesktopDock contract migration

Migrated web/e2e/notes-workspace.test.ts to support the dual-presentation model (Widgets desktop DesktopWindows + always-visible DesktopDock, mobile Sheet with workspace-mobile-navigation, and Zen workspace-panel with zen-edge-btn). Updated element selectors to behavioral contracts: getNotesWorkspace resolves .desktop-window[data-window-id='notes'] on desktop and .workspace-panel on mobile/Zen; openNotesRoot activates Notes via desktop dock or mobile root nav; back button navigation targets .desktop-window-chrome on desktop and .workspace-header on mobile/Zen; verified data-presentation='window' and absence of desktop workspace-switcher. Ensured .desktop-window-content has flex column, overflow hidden, and padding-bottom for resize handles so scroll and footer positioning remain deterministic across all 13 test scenarios.

*Relevance: high*
*Context: Issue #89 migration of Notes workspace e2e tests*
*Tags: notes-workspace e2e desktop-dock desktop-windows contracts*

---
*Observed: 2026-10-04T00:40:42.559Z*
