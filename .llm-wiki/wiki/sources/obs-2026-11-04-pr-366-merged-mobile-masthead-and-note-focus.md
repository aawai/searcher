---
type: source
title: "Observation: PR 366 merged mobile masthead and note focus"
tags:
  - pr-366
  - issue-363
  - merged
  - focus
  - ci
status: observation
created: 2026-11-04
updated: 2026-11-04
slug: obs-2026-11-04-pr-366-merged-mobile-masthead-and-note-focus
relevance: high
observed_at: 2026-11-04T04:27:48.228Z
source_context: 定位 CI 失败并合并 PR 366
---

# ⭐ Observation: PR 366 merged mobile masthead and note focus

PR https://github.com/aawai/searcher/pull/366 已合并 main，merge commit 2a5ccae8dae0a4db88b9abe320ccfd282213fa17。CI 最初两次 documents-chrome 焦点恢复失败；编辑器异步加载切换会卸载并重建侧栏触发按钮，新增稳定 header 和有界焦点恢复，受控延迟加载回归覆盖焦点保留及用户转移后不抢焦点。拖拽测试 CI 一次超时，本地定向 5 项通过；未确认根因，未修改拖拽实现。修复提交 0cac68c 后 GitHub 全部检查通过。

*Relevance: high*
*Context: 定位 CI 失败并合并 PR 366*
*Tags: pr-366 issue-363 merged focus ci*

---
*Observed: 2026-11-04T04:27:48.228Z*
