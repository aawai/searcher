---
type: source
title: "Observation: Documents E2E 提速：分页矩阵 24 场景、5s 初始采样仅证据模式、DENO_JOBS 默认 4"
tags:
  - e2e
  - testing
  - performance
  - pagination
  - deno-jobs
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-documents-e2e-24-5s-deno-jobs-4
relevance: high
observed_at: 2026-11-03T02:27:17.605Z
source_context: 笔记编辑器模式切换改为悬停展开后的 E2E 调度与提速
---

# ⭐ Observation: Documents E2E 提速：分页矩阵 24 场景、5s 初始采样仅证据模式、DENO_JOBS 默认 4

web/e2e/helpers/pagination-stability.ts 原本仍跑 5 视口×亮/暗共 40 场景，与 docs/testing.md / scripts/e2e/README.md 已写明的 6 场景/文件（5 视口默认动效 + 1440×900 reduced motion，共 24）不符；已对齐。initial sample(page,5000) 自 #158 起只写入证据 JSON、不参与断言，现仅在 E2E_EVIDENCE_DIR 时执行；分页调度只用 rAF/ResizeObserver，ready() 之后无延时重排。2s/9s 空闲观察窗与断言不变。四个分页文件合计 ~400s→~120s（3 轮全过）。用户指示把 scripts/e2e/run.ts 显式并行默认 DENO_JOBS 从 2 改为 4（Workspace CI 仍显式固定 2）；本机 8 CPU，documents 集合 jobs=2 3m34s、jobs=4 2m9s，各一轮 35 全过；Workspace/full 未在 jobs=4 下验证。

*Relevance: high*
*Context: 笔记编辑器模式切换改为悬停展开后的 E2E 调度与提速*
*Tags: e2e testing performance pagination deno-jobs*

---
*Observed: 2026-11-03T02:27:17.605Z*
