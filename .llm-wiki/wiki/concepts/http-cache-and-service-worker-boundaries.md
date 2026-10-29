---
type: concept
title: HTTP Cache and Service Worker Boundaries
domain: engineering
created: 2026-10-28
updated: 2026-10-28
sources: [sources/SRC-2026-10-28-001, sources/SRC-2026-10-28-002]
---

# HTTP Cache and Service Worker Boundaries

HTTP 缓存与应用通过 Service Worker / Cache API 管理的缓存是不同的存储和复用边界，不能只靠一处配置推断另一处行为。

## HTTP 响应

- `private` 约束共享缓存，但允许客户端私有缓存保存；Cookie 的存在本身不自动使响应私有。
- `no-cache` 允许存储，复用前须重新验证；`no-store` 指示 HTTP 缓存不保存，但不会追溯删除已缓存的旧响应。
- `Vary` 区分同 URL 的不同请求变体；历史导航或 bfcache 恢复不一定发生普通请求的重新验证。以上见 [MDN HTTP caching](/sources/SRC-2026-10-28-001.md)。

## Cache API 与 Service Worker

应用可以通过 Cache API 显式保存响应、命名并清理缓存；条目不按 HTTP 缓存头自动过期或刷新。`no-store` 并不禁止脚本调用 `cache.put()`；匹配时仍考虑响应的 `Vary`。完整机制见 [MDN Cache](/sources/SRC-2026-10-28-002.md)。

两层分别配置：Service Worker 未拦截请求，不等价于浏览器 HTTP 缓存被绕过；即使 HTTP 响应带 `no-store`，也不能推断应用管理的缓存未保存。账号切换时需分析具体缓存键、生命周期及服务端响应策略，不能仅依赖 Cookie 或标头作完整隔离。

## Searcher 映射

[当前路由策略](../../../web/src/pwa/sw-policy.ts) 对 `/api` 和 `/api/*` 返回 `network`；[worker](../../../web/src/pwa/sw.ts) 只对静态资产和导航调用 `respondWith`，前者 cache-first，后者网络优先并在网络失败时回退已缓存 shell。这只说明 Service Worker 自己不缓存 API，并不证明浏览器或部署环境的其他缓存策略已完成审计。

## 关联

- [PWA Service Worker Update Lifecycle](/concepts/pwa-service-worker-update-lifecycle.md)
- [Browser Storage Persistence and Eviction](/concepts/browser-storage-persistence-and-eviction.md)
- [Service Worker 直通与 HTTP 缓存边界](/sources/service-worker-bypass-does-not-bypass-http-cache.md)
- [Session Security and Isolation](/concepts/session-security-and-isolation.md)
