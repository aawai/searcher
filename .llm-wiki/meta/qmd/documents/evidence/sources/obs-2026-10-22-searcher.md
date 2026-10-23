---
type: source
title: "Observation: Searcher 工作区避让以视觉平衡为优先"
tags:
  - searcher
  - ui
  - design
  - motion
  - workspace
status: observation
created: 2026-10-22
updated: 2026-10-22
slug: obs-2026-10-22-searcher
relevance: high
observed_at: 2026-10-22T14:28:18.390Z
source_context: 按审查反馈编写实施计划并修正
---

# ⭐ Observation: Searcher 工作区避让以视觉平衡为优先

用户在 2026-10-22 UI 修正任务中确认：账户页并入设置导航（/account 路由不变），行内 Input/Select 无边框并右对齐，顶层页面切换增加透明度 View Transition，无图标应用首字母用中性色。面板避让与旧 docs/workspace.md 的“不推动首页”契约冲突，用户先选“只在覆盖时让位”，进一步明确“视觉平衡”：>=768 的非展开 Panel 会遮挡搜索时（<1496px）预留完整面板列，使搜索与应用在剩余空间居中；>=1496px 不移动。实施计划 docs/plans/UI_MOTION_CONSISTENCY_PLAN.md；此为已确认设计决定，当前仍在实现验证，不应记作已完成。

*Relevance: high*
*Context: 按审查反馈编写实施计划并修正*
*Tags: searcher ui design motion workspace*

---
*Observed: 2026-10-22T14:28:18.390Z*
