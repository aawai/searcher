---
type: concept
title: Server-Sent Events (SSE) 与实时事件流
created: 2026-09-25
updated: 2026-09-27
sources:
  - "[[sources/SRC-2026-09-27-003]]"
---

# Server-Sent Events (SSE) 与实时事件流

## 概述

**Server-Sent Events (SSE)** 是一种基于标准 HTTP 协议的长连接单向推送机制。在
[[entities/searcher-项目]] 中，SSE 被广泛应用于两大核心场景：

1. **AI 问答流式输出**：大模型生成的文本片段通过 SSE `data: {"delta": ...}` 逐
   token 实时推送至前端，实现无延迟的打字机交互体验。
2. **便签协同与状态变更广播**：客户端订阅 `/api/notes/events`
   流，服务端在便签被修改时广播 `note.updated`
   事件，支撑跨标签页或多设备的即时同步。

## 技术实现与架构考量

- **Web 标准流集成**：依托 [[entities/hono-framework]] 的 `streamSSE`
  工具，直接在 [[entities/deno-runtime]] 原生 HTTP 管道中建立
  `text/event-stream` 响应。
- **连接生命周期与反向追踪**：通过 WHATWG 标准 `ReadableStream` 的 `cancel()` 生命周期钩子或 Hono 的 `stream.onAbort` 监听客户端断连事件，及时注销事件总线中的 Listener 并清理定时器，杜绝单进程内存泄漏。
- **标头协商与流式缓冲规避**：严格声明 `Content-Type: text/event-stream` 与 `Cache-Control: no-store`，明确禁用反向代理或 CDN 的 Response Buffering，保证服务端生成的每一帧协议块立即穿透至客户端。
- **错误兜底边界**：SSE 标头一旦发出，HTTP 状态码即无法篡改。流内部出现的下游异常必须通过流内专属错误回调处理，无法依赖全局 `onError` 中间件。

## 相关实体与来源

- [[entities/deno-runtime]]: 原生支持 WHATWG Streams 与零依赖 Web 标准 HTTP 服务的运行平台。
- [[entities/hono-framework]]: 驱动 `/api/notes/events` 等流式接口的轻量 Web 框架。
- [[sources/SRC-2026-09-27-003]]: Deno 官方 HTTP Server: Server-sent events 架构范式。
