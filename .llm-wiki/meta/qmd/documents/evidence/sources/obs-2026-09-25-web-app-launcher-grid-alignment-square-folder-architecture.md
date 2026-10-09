---
type: source
title: "Observation: Web App Launcher Grid Alignment & Square Folder Architecture"
tags:
  - frontend
  - layout
  - css-grid
  - dnd-kit
  - webapp-launcher
status: observation
created: 2026-09-25
updated: 2026-09-25
slug: obs-2026-09-25-web-app-launcher-grid-alignment-square-folder-architecture
relevance: high
observed_at: 2026-09-25T09:53:14.169Z
source_context: Web App Launcher desktop layout upgrade
---

# ⭐ Observation: Web App Launcher Grid Alignment & Square Folder Architecture

Web App desktop launcher was upgraded to an occupancy-grid launcher. Folder card
bodies are constrained to a strict 1:1 aspect ratio based on Grid track column
widths (1x1 for small folders, 2x2 for large folders spanning 2*col_w + gap_x).
The folder name is rendered outside the square surface, preserving the 6px label
gap of normal shortcuts. In icons-only mode, the folder scales to fit row
heights (72px / 152px) to prevent displacing neighboring shortcuts. Verified
zero pixel drift against neighboring shortcuts across standard, compact, large,
and mobile 320px viewports.

_Relevance: high_ _Context: Web App Launcher desktop layout upgrade_ _Tags:
frontend layout css-grid dnd-kit webapp-launcher_

---

_Observed: 2026-09-25T09:53:14.169Z_
