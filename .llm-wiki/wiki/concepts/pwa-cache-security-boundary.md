---
type: concept
title: PWA Cache Security Boundary
domain: engineering
created: 2026-10-24
updated: 2026-10-24
---

# PWA 缓存与身份隔离边界

## 平台事实

- Cache API 存储 Request/Response 对，页面和 Worker 均可访问；缓存可被用户清除或因配额被驱逐。[MDN 缓存指南](/sources/SRC-2026-10-24-002.md)
- Cache API 不遵循 HTTP 缓存头且条目不会自动过期；敏感响应必须由 Worker 代码显式排除，已写入的敏感缓存必须删除。HTTP 层仍应发送 Cache-Control: no-store。[OWASP](/sources/SRC-2026-10-24-004.md)
- Cache Storage 为 origin 级共享存储，不天然按登录账号或 Worker scope 隔离；清理要限制在本应用命名前缀内。[生命周期资料](/sources/SRC-2026-10-24-003.md)
- network-first 仍可能落盘并返回历史数据，不等于 network-only。[MDN](/sources/SRC-2026-10-24-002.md)

## Searcher 设计推导，不是实现审计

[INFERENCE] 结合[会话与 owner 隔离](/concepts/session-security-and-isolation.md)，离线外壳应只缓存明确允许的公开静态资源；认证接口、用户笔记、书签、账号偏好不应因为是 GET 或同源就进入公共 Cache Storage。服务端 Cookie 验证不能使先前写入的浏览器响应自动失效。退出登录和账号切换必须考虑所有已有客户端存储，而不是仅撤销服务器 session。

[INFERENCE] 导航 HTML 回退不能覆盖 API JSON 错误或缺失静态资源错误；检查请求类型、method、origin 和允许路径，比按 .json 后缀排除更能表达边界。本轮未检查 Searcher 实现是否满足这些规则。

## 关联与原始证据

- [Service Worker API](/entities/service-worker-api.md)
- [更新生命周期](/concepts/service-worker-update-lifecycle.md)
- [现有离线草稿概念](/concepts/offline-first-与-local-draft-持久化架构.md)
- [MDN 缓存摘录](../../raw/sources/SRC-2026-10-24-002/extracted.md)，221–258、355–394 行。
- [OWASP 摘录](../../raw/sources/SRC-2026-10-24-004/extracted.md)，263–280、363–370 行。
- [web.dev 摘录](../../raw/sources/SRC-2026-10-24-003/extracted.md)，322–356 行。
