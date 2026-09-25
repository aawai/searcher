---
type: concept
domain: engineering
title: "Session Security and Isolation"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-002, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-004]
---

# Session Security and Isolation (会话安全与隔离模式)

**会话安全与隔离**定义了 [[entities/searcher-项目]] 在用户身份认证、会话生命周期以及数据访问隔离方面的硬性安全边界。

## 核心安全规则

1. **不可逆 Token 哈希**：数据库中的 sessions 表绝不存储明文 Session Token，仅持久化存储其经过安全加盐的 SHA-256 哈希值。即便数据库文件发生泄露，攻击者也无法还原有效会话。
2. **防时序攻击（Timing Attack Defense）**：在系统启动时通过 `AuthService` 预计算 `dummyHash`，在用户校验不存在时依然走等长耗时比较，杜绝用户名枚举攻击。
3. **Cookie 安全属性**：客户端仅通过带有 `HttpOnly`、`SameSite=Lax` 以及 HTTPS 环境下带有 `Secure` 标记的 Cookie 传递凭证，防范 XSS 窃取与 CSRF 攻击。
4. **所有权严格隔离（Owner Isolation）**：所有的业务数据（书签、便签、偏好等）均以当前会话验证的用户为唯一 Owner；无权访问或资源不存在统一返回 404，不泄露任何资源存在性线索。

## 关联页面

- 项目应用：[[entities/searcher-项目]]
- 架构总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-004]]
