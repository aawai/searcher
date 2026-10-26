---
type: source
title: "Observation: Issue 313 任务栏 Floating 材质与分组列表重构经 PR 315 合并 main 并关闭"
tags:
  - issue-313
  - pr-315
  - dock
  - settings
  - grouped-list
  - material-floating
  - ui-guard
  - merged
status: observation
created: 2026-10-26
updated: 2026-10-26
slug: obs-2026-10-26-issue-313-floating-pr-315-main
relevance: high
observed_at: 2026-10-26T11:38:59.290Z
source_context: 实施 Issue 313 并通过 PR 315 合并至 main
---

# ⭐ Observation: Issue 313 任务栏 Floating 材质与分组列表重构经 PR 315 合并 main 并关闭

Issue #313 在隔离 worktree .worktrees/issue-313（分支 refactor/313-dock-material-grouped-list）完成实施，经 PR https://github.com/aawai/searcher/pull/315 全 15 项 CI 通过后合并至 main（merge commit 4bf9915），Issue #313 已自动关闭，主工作区 main 已 ff-only 同步。改动涵盖：1) dock.css 与 tokens.css 对齐 .dock-bar / .dock-ball 的 --glass-sheen 与 --shadow-elevation-floating，新增 .app-shell:not([data-home]) 实色回退，登记 --radius-dock-glyph（28px * 0.23）并补齐 1px 内环；2) 移动端任务栏统一 44px 高度，移除 230px 魔法值并增加 .dock-group--apps 溢出滚动边缘遮罩，悬浮球消费 --dock-ball-size 与 safe-area inset，接入 usePresence 成对微过渡及 reduced-motion 纯透明度回退（注意仅在 ending 态给容器设 inert，避免 modalActive 时使内部 DropdownMenu 失焦关闭）；3) 抽取 DockOrderList.tsx 共享排序列表并将 DockSettings 重构为整行 Grouped List；4) 清理 AppForm、SearchHome、HomeGridLab、note-summary 及 docs 中的遗留资料库/便签文案。

*Relevance: high*
*Context: 实施 Issue 313 并通过 PR 315 合并至 main*
*Tags: issue-313 pr-315 dock settings grouped-list material-floating ui-guard merged*

---
*Observed: 2026-10-26T11:38:59.290Z*
