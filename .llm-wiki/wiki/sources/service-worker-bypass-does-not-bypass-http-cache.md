---
type: source
title: Service Worker 直通与 HTTP 缓存边界
status: insight
category: architecture
created: 2026-10-28
updated: 2026-10-28
slug: service-worker-bypass-does-not-bypass-http-cache
---

# Service Worker 直通与 HTTP 缓存边界

Searcher 的 Service Worker 对 `/api` 与 `/api/*` 选择 network，不调用 `respondWith`，只能证明 worker 自身不缓存这些响应，不能证明浏览器 HTTP 缓存被绕过。反过来，HTTP `Cache-Control: no-store` 也不阻止应用脚本显式把响应放入 Cache Storage；缓存隔离须分别核对两层及部署代理。证据见 [[concepts/http-cache-and-service-worker-boundaries]]、[[sources/SRC-2026-10-28-001]]、[[sources/SRC-2026-10-28-002]]。本次只核查 worker 路由代码，未审计响应头或代理配置。

*Category: architecture*

---
*Captured: 2026-10-28*

## Related

_Add links to related pages._
