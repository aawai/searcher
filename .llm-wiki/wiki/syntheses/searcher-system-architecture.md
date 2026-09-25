---
type: synthesis
title: "Searcher System Architecture"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-002, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-004]
---

# Searcher System Architecture (Searcher 系统整体架构与技术全景)

本综合页串联 [[entities/searcher-项目]] 的全局技术选型、设计理念与核心系统约束。

## 1. 架构总览与拓扑结构

Searcher 采用现代化的全栈紧凑型架构，在系统层面上完全践行 [[concepts/single-process-architecture]]：

- **服务端运行时**：由 [[entities/deno-runtime]] 提供强类型执行与原生 HTTP 服务能力（`Deno.serve`）。
- **接入与路由层**：基于 [[entities/hono-framework]] 组装，统一接管中间件流水线（统一响应信封、日志、请求体上限防护以及跨站安全）。
- **前端交互层**：采用 React 19 + Vite 构建，界面层严格遵循 [[entities/shadcn-ui-system]] 规范，静态产物（`web/dist`）直接由同进程内的 Hono 实例宿主提供服务。
- **数据持久层**：基于 [[entities/drizzle-sqlite-store]]，通过 SQLite WAL 模式实现嵌入式存储，所有数据库调用通过 [[concepts/database-queue-serialization]] 提供的 FIFO 队列串行化执行。

## 2. 核心架构约束与设计不变量

1. **同源单进程**：前后端同端口同源部署，消除了 CORS 复杂性，API 统一返回规范的 JSON 数据信封。
2. **严密的会话与权限体系**：遵循 [[concepts/session-security-and-isolation]]，Session Token 仅存 SHA-256 哈希，资源访问隔离仅认当前会话的所有者。
3. **开发与质量保障**：全面实行 [[concepts/contract-first-testing]]，通过自动化契约测试守护系统行为，确保所有重构与功能迭代不产生暗箱破坏。

## 关联实体与概念

- 核心项目：[[entities/searcher-项目]]
- 基础运行：[[entities/deno-runtime]]、[[entities/hono-framework]]、[[entities/drizzle-sqlite-store]]、[[entities/shadcn-ui-system]]
- 核心模式：[[concepts/single-process-architecture]]、[[concepts/database-queue-serialization]]、[[concepts/session-security-and-isolation]]、[[concepts/contract-first-testing]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-004]]
