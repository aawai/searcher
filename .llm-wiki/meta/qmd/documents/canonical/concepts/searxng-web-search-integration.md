---
type: concept
title: SearXNG Web Search Integration
domain: engineering
created: 2026-11-07
updated: 2026-11-07
sources:
  - sources/SRC-2026-11-07-001
---

# SearXNG Web Search Integration

## 来源契约

[SearXNG Search API](/sources/SRC-2026-11-07-001.md)：`GET /search?q=…&format=json`；JSON 须在实例 `settings.yml` 的 `search.formats` 启用，否则 **403**；`q` 原样传给上游引擎。来源未定义 JSON 响应字段。

## Searcher 实现（2026-11-07 读码）

- 启用条件：`SEARXNG_URL` 为合法 http(s) URL（`features/ai/tools.ts` 第 40–41 行）；[docs/ai.md](../../../docs/ai.md) 第 149 行与 `.env.example` 第 8 行已写明需启用 JSON 输出。
- 请求：`new URL("/search", base)`，设置 `q` 与 `format=json`，`Accept: application/json`，`signal: ctx.signal`（第 286–297 行）。
- 响应：取 `data.results` 前 8 条，读取 `title`/`url`/`content`（回退 `snippet`），丢弃无 `url` 的结果（第 307–331 行）。字段名依据是实现与测试中的 mock 服务，而非本来源。
- 非 2xx 返回 `SearXNG search failed with status <code>`，不伪造结果。

## 已验证的差异

- **子路径部署**：`new URL("/search", "https://host.example/searxng/")` 得到 `https://host.example/search`（2026-11-07 `deno eval` 验证）。以绝对路径解析会丢弃 `SEARXNG_URL` 中的路径前缀，挂在反向代理子路径下的实例无法使用。README 的示例（`http://searxng:8080`）是根路径，未覆盖该情形；是否支持子路径是未声明的契约，需人类决定。
- **403 的可诊断性**：未启用 JSON 时用户只看到通用的 “status 403”，没有指向 `search.formats` 配置的提示。

## 未确认

- 该 `fetch` 未设置 `redirect` 与独立超时；docs/ai.md 提到的超时是否由 `ctx.signal` 的上游提供未追踪。目标由运营者配置，SSRF 面见 [SSRF and Outbound Fetch Boundaries](/concepts/ssrf-and-outbound-fetch-boundaries.md)。

## 关联

- [Server-Sent Events 与实时事件流](/concepts/server-sent-events-sse-与实时事件流.md)
- [Searcher 项目](/entities/searcher-项目.md)
