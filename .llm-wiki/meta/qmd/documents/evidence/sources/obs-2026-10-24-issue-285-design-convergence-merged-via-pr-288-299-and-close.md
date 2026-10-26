---
type: source
title: "Observation: Issue 285 design convergence merged via PR 288–299 and closed"
tags:
  - issue-285
  - merged
  - worktree
  - home-notes
  - library
  - e2e
status: observation
created: 2026-10-24
updated: 2026-10-24
slug: obs-2026-10-24-issue-285-design-convergence-merged-via-pr-288-299-and-close
relevance: critical
observed_at: 2026-10-24T19:36:57.484Z
source_context: 完成 issue 285 worktree 实施、PR 与合并
---

# 🔴 Observation: Issue 285 design convergence merged via PR 288–299 and closed

Issue #285 全部子任务合并 main 并关闭：#289 修复 #282 引入的 markdown-vendor 首屏依赖（paper-task-saver 改动态加载）；#288 Y2 断点四档 <640/640–767/768–1023/≥1024 + ui-guard 登记门禁 + web/src/design-system/breakpoints.ts、home-grid.ts；#290 Y4 C1 图标内环 + C8 正方形大文件夹(格宽+间距+图标)、一律 3×3；#291 Y6 2–8；#292 Y4 C2–C5 Material 应用底板、--shadow-elevation-glyph/material/floating、列数平衡、宽屏 --layout-home-content-max: clamp(640px,40vw,880px)、1366×768 底板 3 行；#293/#295 Y7 资料库叠层取代“览”（web/src/features/library，面板 --workspace-panel-width clamp(440px,32vw,560px)，菜单 finalFocus 让位+WorkspaceShell focusin 记录 opener 并把菜单项映射回 aria-controls 触发器）；#294 C6 保持 38% 仅外观设置提示；#296 Y8 webapps/webapp_groups.is_home_fixed（迁移 0029）；#297 Y6.1 笔记库分段筛选+笔记本 Select；#298 Y3 首页笔记 Material，单元=大文件夹足迹 180，S 180×180 / W 372×180，迁移 0030 col/row/size，suite test:home-notes；#299 行数只受 48px 底部留白约束、homeSortOrder→createdAt→id 全序。旧像素列清理跟踪 #300。用户真实壁纸在 /tmp/i285/fixtures（不入库），截图矩阵脚本 /tmp/i285/matrix.ts（勿用 networkidle：SSE /api/documents/events 永不空闲）。教训：用户否决原型时不要让其在有缺陷选项中选，需自行给出合理视觉；API 创建应用自 Y8 起默认不固定，E2E 种子需 isHomeFixed: true；并发 E2E 下偶发 shortcuts-documents-ask / editable-pagination-spike 编辑器 flake；CHANGELOG 用 .git/info/attributes merge=union。

*Relevance: critical*
*Context: 完成 issue 285 worktree 实施、PR 与合并*
*Tags: issue-285 merged worktree home-notes library e2e*

---
*Observed: 2026-10-24T19:36:57.484Z*
