---
type: source
title: "Observation: 设置页与 Widgets 中间视口采用容器查询重排"
tags:
  - ui
  - responsive
  - css-container-queries
  - bento-layout
status: observation
created: 2026-09-30
updated: 2026-09-30
slug: obs-2026-09-30-widgets
relevance: high
observed_at: 2026-09-30T05:52:28.306Z
source_context: "Issue #19: 加固设置页与 Widgets 的中间宽度响应式布局"
---

# ⭐ Observation: 设置页与 Widgets 中间视口采用容器查询重排

在 640-960px 中间视口中，设置面板与 Bento 卡片受到侧栏或列宽分配限制，其实际可用宽度与视口宽度不同步。通过使用 @container settings-panel 与 @container bento-card 驱动行内折行与按钮换行，彻底避免了基于全屏视口断点导致的按钮覆盖标题和 CTA 裁切，同时无需缩小 64x64 方格系统。

*Relevance: high*
*Context: Issue #19: 加固设置页与 Widgets 的中间宽度响应式布局*
*Tags: ui responsive css-container-queries bento-layout*

---
*Observed: 2026-09-30T05:52:28.306Z*
