---
type: source
title: "Observation: Workspace Layout & Style Architecture Decision"
tags:
  - ui
  - ux
  - architecture
  - layout-system
  - workspace
status: observation
created: 2026-09-27
updated: 2026-09-27
slug: obs-2026-09-27-workspace-layout-style-architecture-decision
relevance: high
observed_at: 2026-09-27T02:58:54.446Z
source_context: UI/UX Redesign Evaluation
---

# ⭐ Observation: Workspace Layout & Style Architecture Decision

Decided to replace legacy low-impact StylePreset options ('quiet', 'minimal', 'glass', 'soft', 'classic') with 3 distinct workspace layout modes: 'command' (Raycast/Linear command-centric launcher with inline balanced pins), 'zen' (Arc/Notion minimalist breathing space with slide-over sheet), and 'widgets' (macOS/iPadOS spatial glass desktop with Bento widgets). The implementation will use a headless useHomeWorkspace hook, 3 decoupled layout containers, database schema migration with fallback mapping, and visual card selector in Settings.

*Relevance: high*
*Context: UI/UX Redesign Evaluation*
*Tags: ui ux architecture layout-system workspace*

---
*Observed: 2026-09-27T02:58:54.446Z*
