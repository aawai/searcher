---
type: source
title: "Observation: Issue 177 Widgets 首页反馈经 PR 184 合并关闭"
tags:
  - issue177
  - widgets
  - feedback
  - offline
  - e2e
  - merged
status: observation
created: 2026-10-16
updated: 2026-10-16
slug: obs-2026-10-16-issue-177-widgets-pr-184
relevance: critical
observed_at: 2026-10-16T12:03:55.855Z
source_context: "实施 issue #177 并创建 PR、合并 main、关闭 issue"
---

# 🔴 Observation: Issue 177 Widgets 首页反馈经 PR 184 合并关闭

Searcher issue #177 在隔离 worktree /home/aawei/searcher/.worktrees/issue-177、分支 fix/177-widget-feedback 实施，PR #184 已合并 main，merge commit cc1cf90807a2dffac608a011f9c9bfaa23d2c068，issue CLOSED。Widgets 消费 Notes loading/error 与 Apps 权威 load state，compact semantic 反馈、缓存内容保留、真实重试和同域可见 Workspace 独占 live role；HTTP503 不改判为 Apps network offline。EmptyState 可省略重复 title 仅传 description，修复复用后 Bento compact 高度回归；删除淘汰的私有 empty-text CSS。基线红测失败后 focused 1/10 steps 通过；unit 672/51 steps，UI guard tests100。完整生产首轮57 passed/289 steps、Bento1 failed/2 steps；最终 Bento+ui-feedback 3 passed/36 steps，保留原<120px断言。PR全部8项CI通过，包括完整Workspace、notes、wallpaper、bundle、UI及container。实页44首页+12Host+6错误离线+18最终空态矩阵及3短屏重试，证据分支 evidence/issue-177（9208b72）。真机/软键盘/OS IME/读屏器语音未验证。主工作区已有wiki改动未覆盖；根目录误追加测试已仅撤销代理自写块且确认无diff。

*Relevance: critical*
*Context: 实施 issue #177 并创建 PR、合并 main、关闭 issue*
*Tags: issue177 widgets feedback offline e2e merged*

---
*Observed: 2026-10-16T12:03:55.855Z*
