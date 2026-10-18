---
type: source
title: E2E并行默认启用及回退策略
status: insight
category: testing
created: 2026-10-15
updated: 2026-10-15
slug: e2e-parallel-default-enabled-171
---

# E2E并行默认启用及回退策略

Issue #171 将 Workspace 默认切换为原生文件级 `--parallel`（`DENO_JOBS` 默认 2），CI 同步并行；显式 `test:workspace:serial` 保留回退。根因修复后本机 jobs=2/jobs=3 各三轮全过（164用例/轮），默认并行 CI 首轮 build 8.368s、test 229.313s、整体237.681s，164用例零失败。PR #172 合并后 issue 自动关闭。

*Category: testing*

---
*Captured: 2026-10-15*

## Related

_Add links to related pages._
