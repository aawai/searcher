---
type: concept
domain: engineering
title: "Session Security and Isolation"
created: 2026-09-25
updated: 2026-10-29
sources: [
    sources/SRC-2026-09-25-001,
    sources/SRC-2026-09-25-002,
    sources/SRC-2026-09-25-003,
    sources/SRC-2026-09-25-004,
    sources/SRC-2026-10-26-003,
    sources/SRC-2026-10-27-005,
    sources/SRC-2026-10-27-006,
    sources/SRC-2026-10-29-001,
    sources/searcher-session-token-hash-is-not-salted,
]
---

# Session Security and Isolation (会话安全与隔离模式)

**会话安全与隔离**定义了 [[entities/searcher-项目]]
在用户身份认证、会话生命周期以及数据访问隔离方面的硬性安全边界。

## 核心安全规则

1. **Token 哈希**：[认证实现](../../../src/features/auth/service.ts) 使用 `crypto.getRandomValues` 生成 32 字节随机 Token，仅将其 SHA-256 哈希持久化到 sessions；该哈希没有额外加盐。高熵随机 Token 与哈希存储降低数据库泄露时直接取得会话凭证的风险，不意味着可以保证没有其他泄露途径。
2. **时序防护**：`AuthService` 预计算 `dummyHash`，不存在的用户也执行密码验证以降低时间差；不能据此断言所有用户名枚举途径都已消除。
3. **Cookie 安全属性**：使用 `HttpOnly` 限制脚本读取 Cookie，HTTPS 下使用 `Secure`
   限制传输，`SameSite=Lax` 限制部分跨站携带；这些属性不等价于完整 XSS 或 CSRF 防护。
   状态变更还须服务端请求防护，详见 [CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)
   与 [OWASP 来源](/sources/SRC-2026-10-26-003.md)。[MDN Cookie 指南](/sources/SRC-2026-10-29-001.md)还讨论 `Domain`、`Path`、有效期和前缀；其建议不代表项目已采用相应前缀。本轮未执行项目安全审计。
4. **所有权严格隔离（Owner
   Isolation）**：所有的业务数据（书签、便签、偏好等）均以当前会话验证的用户为唯一
   Owner；无权访问或资源不存在统一返回 404，不泄露任何资源存在性线索。

## 关联页面

- 项目应用：[[entities/searcher-项目]]
- 架构总览：[[syntheses/searcher-system-architecture]]
- [XSS Sanitization and Trusted Types](/concepts/xss-sanitization-and-trusted-types.md)：输出编码、HTML 净化与 DOM sink 的独立防线。

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-004]]
- [OWASP CSRF Prevention](/sources/SRC-2026-10-26-003.md)
- [MDN Secure cookie configuration](/sources/SRC-2026-10-29-001.md)
- [Searcher 会话 Token 使用无盐 SHA-256](/sources/searcher-session-token-hash-is-not-salted.md)
