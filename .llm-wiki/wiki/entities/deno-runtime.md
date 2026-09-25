---
type: entity
category: tool
title: "Deno Runtime"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-005, sources/SRC-2026-09-25-006]
---

# Deno Runtime

**Deno** 是基于 V8 引擎与 Rust 构建的现代 JavaScript/TypeScript 安全运行时，在 [[entities/searcher-项目]] 中作为服务端唯一底层执行环境。

## 关键特性与在项目中的应用

1. **原生 TypeScript 支持**：无需复杂的转译构建链，后端代码（如 `src/main.ts`、`src/app.ts`）直接由 Deno 执行。
2. **标准 HTTP 服务**：采用内置 `Deno.serve` 接口驱动 [[entities/hono-framework]] 实例，实现超低延迟的 HTTP/JSON 处理。
3. **安全权限沙箱**：生产环境中对网络绑定、持久化文件读写进行严密管控。
4. **工程任务与包管理**：通过 `deno.jsonc` 统一锁定项目依赖并编排运行任务，支持标准测试与基准评测。

## 关联架构

- [[concepts/single-process-architecture]]
- [[concepts/contract-first-testing]]
- [[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-005]]
- [[sources/SRC-2026-09-25-006]]
