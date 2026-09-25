---
type: concept
title: Server-Sent Events (SSE) 与实时事件流
created: 2026-09-25
updated: 2026-09-25
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
- **连接生命周期与反向追踪**：通过 `stream.onAbort`
  监听客户端断连事件，及时注销事件总线中的 Listener，防止单进程内存泄漏。
- **错误兜底边界**：SSE 标头一旦发出，HTTP
  状态码即无法篡改。流内部出现的下游异常必须通过流内专属错误回调处理，无法依赖全局
  `onError` 中间件。
