---
type: source
title: "Observation: Zen 便签预览避免 remark 根入口拉入编辑器包"
tags:
  - zen
  - notes
  - bundle
  - markdown
  - lazy-loading
  - issue191
status: observation
created: 2026-10-18
updated: 2026-10-18
slug: obs-2026-10-18-zen-remark
relevance: high
observed_at: 2026-10-18T13:11:31.063Z
source_context: 移动极简空间无容器便签实施，仍在执行完整交互与矩阵验收
---

# ⭐ Observation: Zen 便签预览避免 remark 根入口拉入编辑器包

实施 #191 时 bundle-report 显示 ZenInlineNotes 经 workspace/note-summary.ts 的 remark() 根入口引入 remark-stringify，导致消费首页摘要时静态加载 editor-vendor（约103 KiB gzip）。将共享解析器改为 unified().use(remarkParse).use(remarkGfm)，显式复用 deno.lock 已锁定 unified@11.0.5 与 remark-parse@11.0.0；相关6项摘要测试及前端类型检查通过。真实生产页面 reload 后 performance resource 列表没有 editor-vendor、NoteLivePreviewEditor 或编辑器 runtime 请求。不是通过修改 manualChunks 或放宽 bundle gate 规避。

*Relevance: high*
*Context: 移动极简空间无容器便签实施，仍在执行完整交互与矩阵验收*
*Tags: zen notes bundle markdown lazy-loading issue191*

---
*Observed: 2026-10-18T13:11:31.063Z*
