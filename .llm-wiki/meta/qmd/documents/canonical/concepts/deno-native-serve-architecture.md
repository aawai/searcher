---
type: concept
title: Deno Native Serve Architecture
tags:
  - architecture
  - deno
  - hono
  - http
---

# Deno Native Serve Architecture

## 概述

**Deno Native Serve Architecture** 是基于 Deno 原生异步 I/O 与标准 Web Fetch API 构建的 HTTP 服务运行模型。在 Deno 2 中，`Deno.serve` 成为启动 HTTP 服务的核心标准接口，直接驱动底层的 Hyper / Rust 原生 HTTP 协议栈。

## 核心设计原理

1. **零适配层开销**：传统的 Node.js 框架需要通过适配器将 `IncomingMessage` / `ServerResponse` 转译为标准 `Request` / `Response`。在 Deno 中，[[entities/hono-framework]] 原生使用 Web Fetch API，`Deno.serve(app.fetch)` 实现了零拷贝、零对象转译的高性能调用。
2. **生命周期与依赖注入**：在 Searcher 的实现中（`src/main.ts`），应用依赖通过 `AppDeps` 集中组装，经由 `createApp({ store, auth, origin })` 注入，最终交由 `Deno.serve({ port }, app.fetch)` 托管，保障了可测试性与优雅启停（Graceful Shutdown）。

## 关联

- **实体**：[[entities/deno-runtime]], [[entities/hono-framework]]
- **源文件**：[[sources/SRC-2026-09-27-005]]
