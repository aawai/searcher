---
type: source
title: "Observation: Issue 320 UI Guard 静态表达式覆盖与 Actions 竞态修复经 PR 329 合并 main"
tags:
  - issue-320
  - pr-329
  - ui-guard
  - tsx-scanner
  - wallpaper-e2e
  - editor-shortcuts
status: observation
created: 2026-10-27
updated: 2026-10-27
slug: obs-2026-10-27-issue-320-ui-guard-actions-pr-329-main
relevance: high
observed_at: 2026-10-27T03:02:15.088Z
source_context: "Issue #320 UI Guard expression coverage and CI Actions fixes"
---

# ⭐ Observation: Issue 320 UI Guard 静态表达式覆盖与 Actions 竞态修复经 PR 329 合并 main

Issue #320 在隔离 worktree (.worktrees/issue-320, branch fix/issue-320-ui-guard) 实施并经 PR #329 (merge commit 0ec3e4d07bb5b7e1b8f526de08c8986d677b96a7) 合并至 main 关闭。核心改动：(1) 新增 scripts/ui-guard/static-expressions.ts 并接入 scripts/ui-guard/tsx-scanner.ts，以 TypeScript checker 同文件词法绑定抽取字符串、括号/as/satisfies、模板完整静态 class、条件/短路、cn/clsx 参数/数组/对象键，以及 style 对象的同文件 const、条件对象和静态对象展开（遵守后写覆盖前写，记录未知节点不执行 JS，限制 64 层递归/4096 节点/64 展开组合）；在 scripts/ui-guard/exceptions.ts 为新扫描到的 WorkspaceDock 拖拽/吸边、LibraryPopup 锚点容量和 HomeGridLab 计算位置登记精确 runtime 例外，保持 0 allowance。(2) 解决 Actions 失败：web/src/app/appearance-sync.ts 与 web/src/app/state.tsx 新增 createAppearanceOwnerStore，使匿名/登录外观更新等待本地 IndexedDB 事务提交后再完成保存反馈，消除未修改缓存冗余回写；web/src/features/markdown-editor/commands.ts 与 runtime.ts 新增公开 API syncNativeTextSelection，在格式化命令与 Ctrl/Cmd+B/I 前同步聚焦文本选区，web/e2e/shortcuts-documents-ask.test.ts 在 2 帧后复核键盘选区，web/e2e/route-style-stability.test.ts 等待模型行可见后再测量触控目标。15 项 GitHub Actions 全部通过。

*Relevance: high*
*Context: Issue #320 UI Guard expression coverage and CI Actions fixes*
*Tags: issue-320 pr-329 ui-guard tsx-scanner wallpaper-e2e editor-shortcuts*

---
*Observed: 2026-10-27T03:02:15.088Z*
