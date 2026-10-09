---
type: source
title: "Observation: Bento ratio token, intrinsic height and empty expansion contract implementation (#44)"
tags:
  - '["ui","bento","tokens","layout","e2e"]'
status: observation
created: 2026-10-01
updated: 2026-10-01
slug: obs-2026-10-01-bento-ratio-token-intrinsic-height-and-empty-expansion-contr
relevance: high
observed_at: 2026-10-01T07:46:23.685Z
---

# ⭐ Observation: Bento ratio token, intrinsic height and empty expansion contract implementation (#44)

Implemented Bento formal tokens (--layout-bento-ratio, --layout-bento-columns, etc.) in tokens.css and removed raw 5fr 3fr duplication. Added data-bento-mode (both/apps-only/notes-only/empty) to WidgetsLayout.tsx and home-layouts.css to support full-width expansion of populated cards and compact intrinsic-height placement of empty cards below. Centering updated from 1-3 to 1-4 app tiles via data-few-apps and :nth-child(-n+4). Created independent web/e2e/bento.test.ts with 21 steps covering 375/390/768/1024/1440/1920 viewports in light/dark modes.

*Relevance: high*
*Tags: ["ui","bento","tokens","layout","e2e"]*

---
*Observed: 2026-10-01T07:46:23.685Z*
