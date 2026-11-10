---
type: source
title: "Observation: Issue 383 PR-D 经 PR 391 合并 main 并关闭"
tags:
  - '["issue-383","pr-391","merged","high-contrast","ai-composer","lists"]'
status: observation
created: 2026-11-06
updated: 2026-11-06
slug: obs-2026-11-06-issue-383-pr-d-pr-391-main
relevance: high
observed_at: 2026-11-06T15:29:54.868Z
source_context: 创建 PR 并合并至 main
---

# ⭐ Observation: Issue 383 PR-D 经 PR 391 合并 main 并关闭

#383 高对比主题 PR-D 经 PR https://github.com/aawai/searcher/pull/391 合并 main（merge bbb65a3），CI 17 项全部通过，Issue 自动关闭。内容：高对比主题下无边框字段（.cn-input[data-variant=search]、设置行内字段）补 --field-border；AI 输入框聚焦环 / 框线上缘被 .ask-thread__dock-gradient（定位元素）盖住，改为把 .ask-thread__dock-inner 设为定位元素修复（所有主题）；笔记编辑器与打印克隆丢失 ul/ol 标记（Tailwind preflight），在 document-editor.css / document-print.css 恢复；forced-colors.test.ts A7 扩展到两个高对比主题并断言系统 Highlight；验收记录 docs/audits/hc-2026-11-06。遗留：加载时先按跟随系统渲染、读到异步 owner 缓存后约 120ms 过渡到所存主题，属于 #383 T2 首帧契约，消除需同步预读缓存的设计变更；真实 Windows 强制颜色未测。

*Relevance: high*
*Context: 创建 PR 并合并至 main*
*Tags: ["issue-383","pr-391","merged","high-contrast","ai-composer","lists"]*

---
*Observed: 2026-11-06T15:29:54.868Z*
