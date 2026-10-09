---
type: source
title: "Observation: UI Guard Migration: Settings & Searcher Presentation Components"
tags:
  - ui-guard
  - design-system
  - semantic-css
  - settings
  - searcher
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-ui-guard-migration-settings-searcher-presentation-components
relevance: high
observed_at: 2026-10-01T12:23:38.464Z
source_context: "Issue #52 UI Guard stock violations cleanup"
---

# ⭐ Observation: UI Guard Migration: Settings & Searcher Presentation Components

Completed migration of all 75 static guard violations across 7 presentation files (AiSettings.tsx, AskPage.tsx, SettingsPage.tsx, EngineSelector.tsx, LogoCandidatePicker.tsx, WebAppLauncher.tsx, FloatingNotes.tsx) without introducing new tokens or editing forbidden global stylesheets/guard baselines.

- AiSettings.tsx (33 violations): Migrated provider header, form grid, API key flex row, helper notes, and empty state to semantic classes (.ai-settings-header, .ai-provider-form, .ai-api-key-row, .ai-empty-state) defined in settings.css using design tokens.
- AskPage.tsx (4 violations): Replaced unstyled toast close button with canonical Button component (variant='ghost', size='icon') and .webapp-undo-toast__close class in ask-workspace.css.
- SettingsPage.tsx (2 violations): Replaced inline color-mix/surface background and color overrides on .settings-action-card__badge with semantic data-status='synced' | 'guest' styled in settings.css.
- EngineSelector.tsx (17 violations): Removed inline style flexShrink on Google/Bing/Baidu/DuckDuckGo SVGs, replaced dropdown item spans with .engine-icon, .engine-option-label, and .engine-check-label in semantic.css.
- LogoCandidatePicker.tsx (12 violations): Removed inline styles on loading container, spinner text, and button link; migrated to .app-dialog-icon-subpanel--loading and .app-ai-unavailable-action in semantic.css.
- WebAppLauncher.tsx (4 violations): Replaced static zIndex: 60 with .launcher-drag-overlay using --elevation-drag; wrapped dnd-kit transition with isDragging check to align with legal drag exception; shifted --launcher-columns JSX inline style to data-columns attribute and imperative style.setProperty on gridRef; kept tests green under Deno by importing semantic.css in main.tsx rather than WebAppLauncher.tsx.
- FloatingNotes.tsx (3 violations): Replaced inline cursor/display/padding on .note-drag-handle with token-backed CSS rules in semantic.css.

Verification: 0 new drift, 0 increased violations, 75 violations eliminated, clean Vite build, and 6-scenario Playwright browser verification across 390/768/1440 viewports in light and dark themes with zero console errors.

*Relevance: high*
*Context: Issue #52 UI Guard stock violations cleanup*
*Tags: ui-guard design-system semantic-css settings searcher*

---
*Observed: 2026-10-01T12:23:38.464Z*
