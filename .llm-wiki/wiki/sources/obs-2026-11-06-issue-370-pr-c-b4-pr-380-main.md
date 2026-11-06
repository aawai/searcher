---
type: source
title: "Observation: Issue 370 PR-C（B4）窗口位置预设经 PR 380 合并 main"
tags:
  - '["issue-370","pr-380","windowing","wcag-2.5.7","merged"]'
status: observation
created: 2026-11-06
updated: 2026-11-06
slug: obs-2026-11-06-issue-370-pr-c-b4-pr-380-main
relevance: high
observed_at: 2026-11-06T06:01:02.085Z
---

# ⭐ Observation: Issue 370 PR-C（B4）窗口位置预设经 PR 380 合并 main

Issue #370 B4 在 worktree .worktrees/issue-370-presets（分支 feat/issue-370-window-presets）实施，PR #380 全 17 项 CI 通过后合并 main（merge commit c072d9e）。窗口“⋯”菜单顶部新增 居中/左半屏/右半屏/恢复默认大小；几何纯函数 project/resize/initialRect/presetRect 移入 web/src/features/windowing/window-geometry.ts（Geometry 新增 margin），预设退出最大化并写入记忆矩形。新增 e2e helper web/e2e/helpers/menu.ts highlightMenuItem（ArrowDown 到指定菜单项），ai-window 测试原依赖“Enter 选首项=移动窗口”已改用该 helper。偏差：Issue 写 ≥768 显示，实际自由窗口界为 1024（geometry.wide）；验收“刷新后位置保留”与 workspace.md“刷新不恢复几何”契约冲突，按“与拖动一致”保持会话内记忆，已在 PR 说明。Issue 370 仍开（B3、B5 未完成）。

*Relevance: high*
*Tags: ["issue-370","pr-380","windowing","wcag-2.5.7","merged"]*

---
*Observed: 2026-11-06T06:01:02.085Z*
