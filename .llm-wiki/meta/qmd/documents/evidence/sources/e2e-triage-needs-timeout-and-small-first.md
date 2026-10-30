---
type: source
title: E2E 摸底先小后大并限时
status: insight
category: devops
created: 2026-10-30
updated: 2026-10-30
slug: e2e-triage-needs-timeout-and-small-first
---

# E2E 摸底先小后大并限时

Issue #338 C2 删除面板 Presenter 后，不带 `--timeout` 的 `test:e2e:full --parallel --no-fail-fast` 跑了 42 分钟：JUnit 里 173 个失败用例各等满 Playwright 默认 30s（上界约 8600s，步骤嵌套故为上界），通过用例仅约 600s。根因是共享 helper（`closeLibrary` 等“返回首页”按钮）与 Dock 按钮精确名称失效，同一根因重复出现。

规则（已写入 docs/testing.md「摸底与失败处理」与 scripts/e2e/README.md）：
1. 改共享 helper/公共选择器/删组件后，先单跑 2–3 个代表文件，再整套摸底。
2. `full`/`affected` 的 `--no-fail-fast` 必须带 `--timeout 5000`；摸底结果不是通过证据，验收去掉 `--timeout` 重跑受影响集合。
3. 按 Call log 归并共同根因，修后只重跑受影响文件（后续每轮 3–5 分钟）。

机制：`scripts/e2e/run.ts` 在 full/affected 无超时 no-fail-fast 时启动即警告；失败后用 `scripts/e2e/junit-summary.ts` 统计耗时达到超时的失败用例并写入 `timings.json`（failedCases/timeoutLikeFailures/timeoutLikeSeconds），无超时且不少于 5 个时输出归类与限时建议。注意：JUnit 同时包含测试与步骤，对 time 求和会重复计数。

*Category: devops*

---
*Captured: 2026-10-30*

## Related

_Add links to related pages._
