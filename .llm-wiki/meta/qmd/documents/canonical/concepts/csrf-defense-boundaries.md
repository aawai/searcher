---
type: concept
title: CSRF Defense Boundaries
domain: engineering
created: 2026-10-26
updated: 2026-10-26
---

## 防护对象

[OWASP 来源](/sources/SRC-2026-10-26-003.md)（[raw](../../raw/sources/SRC-2026-10-26-003/extracted.md)，第 293–340、515–570、628–670 行）说明 Cookie 自动携带导致的请求伪造。HttpOnly 约束脚本读取 Cookie，Secure 约束 HTTPS 传输，SameSite 约束跨站携带；三者都不等价于完整 CSRF 防护或 XSS 防护。

## 前提与边界

- 状态变更不能使用 GET；Lax 仍允许跨站顶层安全方法导航。
- same-site 不等于 same-origin，不能仅凭 SameSite 信任兄弟子域。
- Token 方案应绑定会话、不可预测且不进入 URL/日志；自定义 header 方案则依赖 preflight 和严格 CORS allowlist。
- Origin/Referer 校验、Fetch Metadata 和 token 的选型依赖客户端与部署契约，不将所有机制机械叠加为必选。
- XSS、由不可信 URL 等输入驱动的 client-side CSRF 仍须独立处理。

## 项目适用性

[Session Security and Isolation](/concepts/session-security-and-isolation.md) 记录的 Cookie 属性只是防线的一部分。项目规则声明另有 API Origin 检查；本轮没有执行代码安全审计，不据此判断其完整性。

关联：[Deno Permission Boundaries](/concepts/deno-permission-boundaries.md)，区分浏览器请求信任边界与服务器进程权限。
