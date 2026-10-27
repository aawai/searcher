---
type: source
title: "Observation: Issue 325 UI 契约经 PR 331 合并 main"
tags:
  - issue-325
  - pr-331
  - ui-contract
  - accessibility
  - contrast
  - settings
  - button
  - miniature
status: observation
created: 2026-10-27
updated: 2026-10-27
slug: obs-2026-10-27-issue-325-ui-pr-331-main
relevance: high
observed_at: 2026-10-27T07:11:34.061Z
source_context: Issue 325 implementation and merge
---

# ⭐ Observation: Issue 325 UI 契约经 PR 331 合并 main

Issue #325 在 .worktrees/issue-325 的 docs/325-ui-contract 分支完成，通过 PR #331 合并至 main（merge c224378e7afbdec4b3db2de37832eb14acd628e3），issue 已关闭。修正设置移动分类/详情路径和标题、Button 默认与变体、文件夹缩略图圆角及样式 owner、信息文字 4.5:1 与非文字 3:1 的适用边界；只改文档与 CSS 注释，保留 #323 Grouped List。验证：registry 7 tests、glass contrast 54 tests、check:ui 扫描 245 文件零违规和 allowance、28 个相对链接有效，PR 15 项 Actions 检查通过。已记录待后续修复的既有标题差距：Admin 部分空状态 h1 后直接 h3、Ask 登录且无模型时缺少 h1。glass-contrast.test.ts 对玻璃 --muted 仅断言 3:1、未覆盖 clear Material；同一合成模型的 Floating dark/regular 示例为 4.18:1、light/clear 示例 3.62:1，仅是模型风险，并非已确认的实页故障。

*Relevance: high*
*Context: Issue 325 implementation and merge*
*Tags: issue-325 pr-331 ui-contract accessibility contrast settings button miniature*

---
*Observed: 2026-10-27T07:11:34.061Z*
