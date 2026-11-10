---
type: concept
domain: engineering
title: OpenAI-Compatible Streaming and Tool Calls
created: 2026-11-08
updated: 2026-11-08
sources:
  - sources/SRC-2026-11-08-005
  - sources/SRC-2026-11-08-006
---

# OpenAI-Compatible Streaming and Tool Calls

## 来源契约

- [openai-node README](/sources/SRC-2026-11-08-006.md)：默认重试 2 次（连接错误、408、409、429、>=500），默认超时 10 分钟且超时后也会重试。`signal` 能在读取响应体期间取消请求。
- [Function calling guide](/sources/SRC-2026-11-08-005.md)：一次响应可能含多个调用；每个结果必须引用对应的 call id；参数是 JSON 字符串。流式模式下按输出索引累积参数 delta。建议开启 strict mode，Chat Completions 默认非 strict。

## Searcher 实现（2026-11-08 读码）

- **Client**（`src/features/ai/client.ts`）：`createClient` 显式设置 `maxRetries: 0`、`timeout: 2**31-1`、`fetchOptions.redirect: "error"`。即关闭 SDK 的自动重试与 10 分钟默认超时，取消改由调用方的 `signal` 负责。Base URL 只接受公开 HTTPS 或回环 HTTP，见 [SSRF](/concepts/ssrf-and-outbound-fetch-boundaries.md)。
- **流式解析**（`streamOpenAIChat`）：请求 `stream_options.include_usage`；`delta.content` 逐个 yield 为 `token`；`delta.tool_calls` 以 `index` 为键累积，对 `id`、`name`、`arguments` 三个字段都做**字符串拼接**。流结束后若存在带 name 的调用，就 yield 一个 `tool_calls` 事件并结束，不再发 `done`。`APIError` 映射为带 HTTP 状态的错误文案。
- **工具循环**（`src/features/ai/service.ts` 约第 2042–2289 行）：最多 3 轮（`MAX_TOOL_ROUNDS`）。同一轮内的多个调用按顺序执行，结果以 `role: "tool"` 和 `tool_call_id` 写回；随后在这些 tool 消息之前插入一条 `assistant` 消息，`content: ""`、`tool_calls` 为本轮调用。如果用到了工具但始终没有文本输出，会再发一轮不带 tools 的请求，迫使模型给出文本。
- **工具定义**（`src/features/ai/tools.ts`）：`lookup_documents`、`lookup_apps`、`web_search`（仅在配置了 SearXNG 时提供），没有设置 `strict` 或 `additionalProperties: false`。参数 JSON 解析失败时退化为 `{ raw }`。未知工具名由 `executeToolCall` 返回错误，但 service 发给 UI 的 `tool-call` 事件会把未知名称归类为 `webSearch`。

## 已验证的行为

2026-11-08 用临时脚本，以 mock `fetchFn` 给 `streamOpenAIChat` 喂 SSE（脚本已删除）：

- 每个 tool_call delta 都重复携带 `id: "call_A"` 时，结果 id 为 `call_Acall_Acall_A`。
- 第二个 delta 再次携带 `name: "web_search"` 时，结果 name 为 `web_searchweb_search`。按 `executeToolCall` 的分支，这个名字会被判为未知工具（由代码推出，未端到端运行）。
- 同一轮里工具调用之前的文本（“先查一下。”）仍作为 `token` 下发。

## 差异与风险

- **重复字段的 delta**：OpenAI 官方流只在首个 delta 中给出 `id` 与 `name`，此时拼接没有问题。哪些 OpenAI 兼容 Provider 会在后续 delta 中重复这两个字段，**未核实**。如果存在：id 重复只会让 id 变长，`tool_call_id` 与 assistant `tool_calls` 仍然一致；name 重复则会让工具调用失败。只对 `arguments` 做拼接、对 `id`/`name` 采取首次出现即固定，可以同时兼容这两种情况，但需要确认 Provider 的实际行为。
- **前置文本不进入历史**：工具调用轮插入的 assistant 消息 `content` 为空，同轮已下发的文本不会回传给模型；但它保留在 `fullContent` 中，所以最终答案仍会显示。
- **第 3 轮仍有工具调用**：如果此前已有任何文本，就不会追加无 tools 的收尾轮，第 3 轮的工具结果不会被模型消费。这是读码推断，未运行验证。
- **Strict mode**：未开启。考虑到兼容非 OpenAI Provider，这是合理取舍；代价是参数只能“尽力而为”，所以需要依赖现有的 `{ raw }` 回退与空 query 处理。

## 关联

- [Server-Sent Events 与实时事件流](/concepts/server-sent-events-sse-与实时事件流.md)
- [AbortController and Request Cancellation](/concepts/abortcontroller-and-request-cancellation.md)
- [SearXNG Web Search Integration](/concepts/searxng-web-search-integration.md)
- [Field Encryption and Key Management](/concepts/field-encryption-and-key-management.md)
- [Searcher 项目](/entities/searcher-项目.md)
