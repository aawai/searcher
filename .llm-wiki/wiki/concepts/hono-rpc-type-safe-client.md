---
type: concept
domain: engineering
title: "Hono RPC & Type-Safe Client"
created: 2026-09-26
updated: 2026-09-26
sources: [
    sources/SRC-2026-09-26-003,
]
---

# Hono RPC & Type-Safe Client (端到端类型安全 RPC)

**Hono RPC** 是 [[entities/hono-framework]] 提供的全栈类型安全客户端模式。通过在服务端将路由方法进行链式推导（Method Chaining）并导出代表整体 API 类型的 `AppType = typeof routes`，前端客户端通过 `hc<AppType>` 无需生成代码即可获得类似于 tRPC 的自动补全与类型推导。

## 核心机制

1. **方法链式推导**：服务端的路由定义必须通过链式调用（如 `.get(...).post(...)`）串联，确保 TypeScript 编译器能够将所有子路由、HTTP 动词、路径参数与响应体类型合并为一个统一的类型结构。
2. **零代码生成**：传统 OpenAPI / Swagger 方案需要定时生成或构建 SDK 代码；Hono RPC 仅依赖 TypeScript 的类型导入，在单仓或 monorepo 环境下修改后端响应格式可立即在前端引发编译期错误。
3. **边界校验无缝契合**：与 Zod（`@hono/zod-validator`）等 schema 验证中间件配合使用时，校验后提取的输入数据与响应数据直接纳入路由类型推导，传递给前端客户端类型提示。

## 关联页面

- 框架选型：[[entities/hono-framework]]
- 综合总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-26-003]]
