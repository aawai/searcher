---
type: source
title: "Observation: Issue 179 Zen chrome inset 经 PR 186 合并关闭"
tags:
  - searcher
  - zen
  - workspace
  - issue-179
  - pr-186
  - chrome
  - geometry
  - acceptance
status: observation
created: 2026-10-17
updated: 2026-10-17
slug: obs-2026-10-17-issue-179-zen-chrome-inset-pr-186
relevance: high
observed_at: 2026-10-17T01:18:17.477Z
source_context: 完成issue179、创建PR并合并main关闭issue
---

# ⭐ Observation: Issue 179 Zen chrome inset 经 PR 186 合并关闭

Searcher issue #179 已在隔离 worktree .worktrees/issue-179 实施，经 PR #186 合并 main，merge commit 6a34b75；issue已确认CLOSED，本地主main已fast-forward。修复复用 useDesktopGeometry.chromeBottom，通过 SearchHome→WorkspaceShell→WorkspaceSurface 输入，Panel CSS max(64px语义inset, measured chromeBottom)，不新增measurement/visualViewport owner、不抬banner z-index、不改Sheet/constrained/v4。baseline8e50419 focused red Retry中心命中h2.workspace-title；最终green真实auth/me失败→网络恢复→实际登录→Panel Retry click成功，回到64px。unit673/51steps、UIguard100、12固定实页组合及断点/短屏分批通过。local全E2E首轮62pass/290steps、1失败（移动Undo提示超时），原模块baseline/final各1pass/6steps。PR六个CI Workflow最终全成功；Workspace首轮apps-density在390resize采到540px宽度失败，保留原断言，baseline模块通过，手动复查失败job为43pass/135steps。完整证据evidence/issue-179分支/evidence/issue-179/REPORT.md，证据最新417bc2a；媒体不入main。真机/软键盘未验证。

*Relevance: high*
*Context: 完成issue179、创建PR并合并main关闭issue*
*Tags: searcher zen workspace issue-179 pr-186 chrome geometry acceptance*

---
*Observed: 2026-10-17T01:18:17.477Z*
