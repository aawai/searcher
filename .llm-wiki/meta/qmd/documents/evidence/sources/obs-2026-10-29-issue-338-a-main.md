---
type: source
title: "Observation: Issue 338 A 合入 main 会触发镜像发布"
tags:
  - issue338
  - 阶段A
  - C1
  - Docker
  - main
  - 发布
status: observation
created: 2026-10-29
updated: 2026-10-29
slug: obs-2026-10-29-issue-338-a-main
relevance: high
observed_at: 2026-10-29T09:56:07.288Z
source_context: 评估是否可合并当前 PR 后再实施下一阶段
---

# ⭐ Observation: Issue 338 A 合入 main 会触发镜像发布

.github/workflows/docker.yml 对 main push 构建镜像；通过该 workflow 自身的 runtime smoke 后自动发布 ghcr.io/aawai/searcher 的 latest 与 SHA 标签，不等待其他独立 UI/E2E workflow。docs/deployment.md:137-145 确认其他 workflow 不构成镜像发布门禁。Issue 338 要求阶段 A 六入口偏好与 C1 同版本上线；因此不应把仅含 A、没有 C1 的改动直接合入会发布 latest 的 main。是否有下游自动部署 latest 未查证；独立的 0/C0 可经隔离和验收后先行发布。

*Relevance: high*
*Context: 评估是否可合并当前 PR 后再实施下一阶段*
*Tags: issue338 阶段A C1 Docker main 发布*

---
*Observed: 2026-10-29T09:56:07.288Z*
