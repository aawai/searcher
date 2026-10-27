---
type: source
title: "Observation: Issue 322/327 UI Guard 与 Token 治理经 PR 330 合并"
tags:
  - issue-322
  - issue-327
  - pr-330
  - ui-guard
  - tailwind
  - visual-contract
status: observation
created: 2026-10-27
updated: 2026-10-27
slug: obs-2026-10-27-issue-322-327-ui-guard-token-pr-330
relevance: high
observed_at: 2026-10-27T05:23:27.123Z
source_context: Issue 322 and 327 implementation and merge
---

# ⭐ Observation: Issue 322/327 UI Guard 与 Token 治理经 PR 330 合并

Searcher issue #322、#327 经 PR #330 从 fix/322-327-ui-guard（提交 872874b34fe4）合并至远端 main，两个 issue 均关闭。新增 raw-color CSS/静态 TSX 检查与精确笔记、引擎、Lab 例外；Tailwind 视觉工具类及断点在 Visual Language 登记，check:ui 核对 tokens.css 的 @utility/断点绑定。域名回退跨模块函数为静态抽取未知边界，由 iconFallback.test.ts 保护。140 项 Guard 测试通过，check:ui 扫描 245 文件、0 违规/0 allowance；本地受影响 E2E 9 测试/43 步及首页构图测试通过，PR 七项 Actions workflow 全通过。真实页面 390/768/1440 × light/dark 和 639/640、767/768、1023/1024 边界已核对。既有观察：390px 首页大量应用加两张流式笔记时，任务栏遮挡第二张笔记部分内容；改动前 main 与改动后的对应截图 SHA-256 完全一致，不由 PR 330 引入。

*Relevance: high*
*Context: Issue 322 and 327 implementation and merge*
*Tags: issue-322 issue-327 pr-330 ui-guard tailwind visual-contract*

---
*Observed: 2026-10-27T05:23:27.123Z*
