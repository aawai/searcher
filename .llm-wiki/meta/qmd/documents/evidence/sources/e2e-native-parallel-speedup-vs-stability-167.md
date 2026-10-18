---
type: source
title: E2E原生并行提速存在但默认保留串行
status: insight
category: testing
created: 2026-10-15
updated: 2026-10-15
slug: e2e-native-parallel-speedup-vs-stability-167
---

# E2E原生并行提速存在但默认保留串行

Issue #167 在 Deno 2.9.7 下实测 `--parallel` + `DENO_JOBS`：CI jobs=2 中位 wall-clock 从串行约382s降至约215s（约43.7%），jobs=3降至约200s（约47.6%），9轮CI全过；但本机 jobs=2 1/3失败、jobs=3 3/3失败，且原始串行也有1/3失败。结论：提速真实存在但小样本、跨硬件不稳定，故默认 Workspace 与 CI 保留串行，并行仅显式 opt-in。证据见 `scripts/e2e/BENCHMARKS.md` 与远程 `evidence/issue-167` 分支。

*Category: testing*

---
*Captured: 2026-10-15*

## Related

_Add links to related pages._
