---
type: concept
domain: engineering
title: "Session Security and Isolation"
created: 2026-09-25
updated: 2026-10-26
sources: [
    sources/SRC-2026-09-25-001,
    sources/SRC-2026-09-25-002,
    sources/SRC-2026-09-25-003,
    sources/SRC-2026-09-25-004,
    sources/SRC-2026-10-26-003,
]
---

# Session Security and Isolation (会话安全与隔离模式)

**会话安全与隔离**定义了 [[entities/searcher-项目]]
在用户身份认证、会话生命周期以及数据访问隔离方面的硬性安全边界。

## 核心安全规则

1. **不可逆 Token 哈希**：数据库中的 sessions 表绝不存储明文 Session
   Token，仅持久化存储其经过安全加盐的 SHA-256
   哈希值。即便数据库文件发生泄露，攻击者也无法还原有效会话。
2. **防时序攻击（Timing Attack Defense）**：在系统启动时通过 `AuthService`
   预计算
   `dummyHash`，在用户校验不存在时依然走等长耗时比较，杜绝用户名枚举攻击。
3. **Cookie 安全属性**：使用 `HttpOnly` 限制脚本读取 Cookie，HTTPS 下使用 `Secure`
   限制传输，`SameSite=Lax` 限制部分跨站携带；这些属性不等价于完整 XSS 或 CSRF 防护。
   状态变更还须服务端请求防护，详见 [CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)
   与 [OWASP 来源](/sources/SRC-2026-10-26-003.md)。本轮未执行项目安全审计。
4. **所有权严格隔离（Owner
   Isolation）**：所有的业务数据（书签、便签、偏好等）均以当前会话验证的用户为唯一
   Owner；无权访问或资源不存在统一返回 404，不泄露任何资源存在性线索。

## 关联页面

- 项目应用：[[entities/searcher-项目]]
- 架构总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-004]]
- [OWASP CSRF Prevention](/sources/SRC-2026-10-26-003.md)
