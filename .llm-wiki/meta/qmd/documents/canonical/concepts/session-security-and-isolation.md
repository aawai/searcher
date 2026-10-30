---
type: concept
title: Session Security and Isolation
domain: engineering
created: 2026-09-25
updated: 2026-10-30
sources:
  - sources/SRC-2026-09-25-001
  - sources/SRC-2026-09-25-002
  - sources/SRC-2026-09-25-003
  - sources/SRC-2026-09-25-004
  - sources/SRC-2026-10-26-003
  - sources/SRC-2026-10-27-005
  - sources/SRC-2026-10-27-006
  - sources/SRC-2026-10-29-001
  - sources/SRC-2026-10-30-005
  - sources/searcher-session-token-hash-is-not-salted
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

## 对照 OWASP 会话管理指南（2026-10-30 读取源码）

[OWASP Session Management](/sources/SRC-2026-10-30-005.md)（[raw](../../raw/sources/SRC-2026-10-30-005/extracted.md)，第 347–451、453–517、631–690 行）与当前实现的对照。只比对了 [`service.ts`](../../../src/features/auth/service.ts)、[`security.ts`](../../../src/features/auth/security.ts) 与 `auth.route.ts` 的相关片段，不是安全审计。

| 指南要求 | 当前实现 | 状态 |
| --- | --- | --- |
| 令牌至少 128 bit，CSPRNG | 32 字节（256 bit）随机 | 满足 |
| 服务端只存单向校验值，快速哈希即可 | 仅存 SHA-256 哈希 | 与“令牌哈希”一节一致 |
| 会话名称不暴露技术栈 | `searcher_session` | 未使用框架默认名 |
| `HttpOnly`、`Secure`、显式 `SameSite` | `HttpOnly; SameSite=Lax; Path=/`，HTTPS 时加 `Secure` | 满足；指南允许 `Lax`，首选 `Strict` |
| `__Host-` 前缀（推荐） | 未使用 | 未采用 |
| 提权/改密后换新会话 | 登录总是生成新令牌；改密提升 `authVersion` 并删除该用户全部会话 | 满足 |
| 只接受服务端生成过的 ID | 令牌必须命中已存哈希 | 满足 |
| 服务端 absolute 超时 | `expiresAt`：普通 7 天、记住我 30 天；到期校验时删除 | 满足 |
| 服务端 idle 超时 | 每次请求更新 `lastActiveAt`，但 `authenticateSessionToken` 只检查 `expiresAt`，未用 `lastActiveAt` 判定过期 | 未实现；`lastActiveAt` 仅用于记录与会话列表 |
| 登出在服务端作废会话 | `revokeSession` 删除记录并发出 `Max-Age=0` 的 Cookie | 满足 |
| 敏感响应 `Cache-Control: no-store` | `/api` 响应统一设置 | 满足 |
| 登出时 `Clear-Site-Data` | `src`、`web/src` 中无检索结果 | 未采用；指南指出 `"cache"` 会清空整个源缓存，需与 Service Worker 与离线缓存边界一并评估 |

未实现项是否构成风险取决于威胁模型和产品取舍（7 天绝对期限与 idle 超时的可用性权衡指南也强调须按应用性质选择），本页不下结论。

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
- [OWASP Session Management](/sources/SRC-2026-10-30-005.md)
- [Password Hashing and PBKDF2 Parameters](/concepts/password-hashing-and-pbkdf2-parameters.md)
