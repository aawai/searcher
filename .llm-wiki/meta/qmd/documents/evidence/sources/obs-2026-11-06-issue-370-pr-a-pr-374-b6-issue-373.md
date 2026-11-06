---
type: source
title: "Observation: Issue 370 PR-A 提交为 PR 374，B6 跟进为 Issue 373"
tags:
  - '["accessibility","wcag","issue-370","issue-373","pr-374"]'
status: observation
created: 2026-11-06
updated: 2026-11-06
slug: obs-2026-11-06-issue-370-pr-a-pr-374-b6-issue-373
relevance: high
observed_at: 2026-11-06T00:03:19.859Z
---

# ⭐ Observation: Issue 370 PR-A 提交为 PR 374，B6 跟进为 Issue 373

#370 PR-A（B1 底线重写 + B2 大字 3:1 分级）在 worktree .worktrees/issue-370-baseline（分支 docs/issue-370-baseline）提交为 PR #374。VISUAL_LANGUAGE「一、底线」改为 WCAG 2.2 AA 基准表 + A1–A7 附加表 + ### 验证与已知缺口；Input 段落写入文本字段必须有占位文字（#369 T1 只引用）。glass-contrast.test.ts 新增 LARGE_TEXT_ROLES（page-title 24、masthead-day 128/88）与读取 tokens.css 的 ≥24px 登记守卫；SECONDARY_TEXT 拆为 WCAG_AA_NON_TEXT / GLYPH_EDGE / MUTED_GLASS_PROBE，阈值不变，用例 30→35。B6 跟进 Issue #373 登记应用网格排序与 PaneResizeHandle（侧栏+大纲）2.5.7 未达标。escape-layer-stack 不负责焦点恢复，A5 容器回退未审查，列入 B5。

*Relevance: high*
*Tags: ["accessibility","wcag","issue-370","issue-373","pr-374"]*

---
*Observed: 2026-11-06T00:03:19.859Z*
