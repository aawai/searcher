---
type: source
title: Dock 有效方向与响应式覆盖收敛
status: insight
category: frontend
created: 2026-10-27
updated: 2026-10-27
slug: issue-326-dock-effective-edge-responsive
---

# Dock 有效方向与响应式覆盖收敛

Searcher issue #326 经 PR #332 合并至 main（merge commit f1abceb5bff5031ce0f542e60e21a2f11490d977）。WorkspaceDock 的 effectiveEdge 是 Dock 定位、滚动轴及 root inset 的唯一方向事实：窄于 768px 时为 bottom，但本地桌面方向不被改写。dock.css 将 bar 固定厚度限定于 ≥768px；手机底部保留 max(--space-2, env(safe-area-inset-bottom, --space-2))、宽度约束、min-height 和 apps max-width:none，删除已不可达的方向及滚动轴 !important 覆盖。四个保存方向 × 1440/767/768 的 12 组实际几何、滚动轴、divider 和 root inset 与重构前完全一致；34px 模拟底部安全区初始加载得到 34px 间距和 90px inset。Dock/inset 定向 E2E 13 项 24 steps、UI Guard 以及 PR 15 项 CI checks 全部通过；390/768/1440 light/dark 与 844×390 实页已检查。visualViewport 键盘条件通过 CDP 模拟，非实体键盘。

*Category: frontend*

---
*Captured: 2026-10-27*

## Related

_Add links to related pages._
