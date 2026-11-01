---
type: source
title: "Observation: 首页顶栏 Material 组与笔记底栏对齐经 PR 356 合并 main"
tags:
  - ui
  - topbar
  - notes
  - footer
  - pr-356
status: observation
created: 2026-10-31
updated: 2026-10-31
slug: obs-2026-10-31-material-pr-356-main
relevance: high
observed_at: 2026-10-31T12:28:39.522Z
source_context: 顶栏 icon 突兀与笔记底栏对齐修复
---

# ⭐ Observation: 首页顶栏 Material 组与笔记底栏对齐经 PR 356 合并 main

PR #356（merge 52baaae）：首页主题+头像合为一个 Material 组，字标同高同圆角、句点 --accent，头像改 --surface-control-thumb + --shadow-avatar-edge（深色 --material-solid 即 --surface-soft 导致灰圈套黑盘）。笔记窗口体去底部 16px，回收站上下各 8px；状态栏改用与侧栏条目相同的 (hover:hover) and (pointer:fine) and (min-width:640px) 紧凑判定，修复触屏笔记本中线差 8px；紧凑模式图标 ::after 保留 44px 命中区，粗指针侧栏调宽区 .documents-sidebar-resize 止于底栏行之上。E2E 用 --blink-settings 模拟鼠标/触屏笔记本/触屏三档。CI 17 项全过。

*Relevance: high*
*Context: 顶栏 icon 突兀与笔记底栏对齐修复*
*Tags: ui topbar notes footer pr-356*

---
*Observed: 2026-10-31T12:28:39.522Z*
