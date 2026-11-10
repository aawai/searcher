---
type: concept
title: Login Throttling and Rate Limiting
domain: engineering
created: 2026-11-08
updated: 2026-11-08
sources:
  - sources/SRC-2026-11-08-002
  - sources/SRC-2026-11-08-003
---

# Login Throttling and Rate Limiting

## 来源契约

- [OWASP Authentication Cheat Sheet](/sources/SRC-2026-11-08-002.md)：失败计数应挂在**账号**上，不挂在来源 IP 上。策略三要素是阈值、观察窗口、锁定时长，可以用指数锁定。锁定机制不能被用来让他人账号 DoS。登录失败返回通用错误，处理时间与状态码都不能形成差异因素。
- [MDN Retry-After](/sources/SRC-2026-11-08-003.md)：`429` 附带 `Retry-After: <delay-seconds>`，值为非负整数秒，从收到响应起计算。

## Searcher 实现（2026-11-08 读码）

- `src/features/auth/security.ts` 中的 `InMemoryRateLimiter`：基于进程内 `Map` 的**固定窗口**计数器，没有持久化，进程重启即清零。条目上限 `maxEntries` 默认 10000。表满时先清理过期条目，仍满则拒绝**新** key。
- `src/features/auth/auth.route.ts` 第 78–90 行创建两个实例：
  - `ipLimiter`：注册与登录共用，按 socket IP，每 15 分钟 30 次。
  - `loginUserLimiter`：只用于登录，按标识符，每 15 分钟 10 次。
- 计数发生在校验密码**之前**，成功登录也计入。超限时返回 `429` 与 `Retry-After`（秒），文案统一为“请求过于频繁”。
- 标识符经 `loginIdentifierSchema` 做 trim 和小写，所以注释里的 normalized username 成立。但 key 取的是用户输入的标识符：同一账号用用户名和用邮箱登录，分别落在两个计数桶。
- 用户不存在时校验 dummy hash；不存在、密码错、已禁用、已软删除都返回同一个 `400 用户名或密码错误`，符合 OWASP 的通用错误与计时要求。
- 前端 `web/src/` 中没有对 `429` 或 `Retry-After` 的专门处理（grep 无结果），`docs/` 与 README 也没有记录这一限流契约。

## 已验证的行为

2026-11-08 用 `deno eval` 直接调用 `InMemoryRateLimiter`，参数为 `windowMs=60s`、`maxRequests=2`、`maxEntries=2`：

- 第 3 次请求被拒，`retryAfter=60`；30 秒后再请求仍被拒，`retryAfter=30`，即固定窗口，不滑动。
- 表满时，新 key 被拒并返回整窗口 `retryAfter=60`；窗口过期后同一 key 放行。

## 与来源的差异与风险

- **反向代理下共用一个 IP 桶**：`getClientIp` 取的是 `getConnInfo` 的 socket 远端地址，不读 `X-Forwarded-For`。README 第 134 行的推荐部署是由反向代理终止 TLS，此时 socket 远端是代理，所有访客共用一个 `ip:` 桶，即全站登录加注册每 15 分钟共 30 次。这是根据代码与部署文档推出的结论，未在代理环境实测。是否信任转发头属于部署契约问题：盲目信任会被伪造头绕过，需要人类决定可信代理的配置方式。
- **账号维度是固定窗口，不是锁定**：每个标识符每 15 分钟最多 10 次，攻击者可以持续保持这个速率。达到上限后，同一标识符的合法用户也会收到 429；OWASP 第 579 行提醒的锁定型 DoS 在这里同样存在。没有指数退避，也没有失败日志（OWASP 第 591–597 行）。
- **表满拒绝新 key**：对 `user:` 维度，攻击者需要在一个窗口内制造 10000 个不同标识符。每个 IP 只有 30 次，所以至少需要约 334 个 IP；直连部署下成本高。在反向代理部署下，IP 维度已经先成为瓶颈。

## 关联

- [Session Security and Isolation](/concepts/session-security-and-isolation.md)
- [Password Hashing and PBKDF2 Parameters](/concepts/password-hashing-and-pbkdf2-parameters.md)
- [Hono Security Middleware vs API Guard](/concepts/hono-security-middleware-vs-api-guard.md)
- [Single-Process Architecture](/concepts/single-process-architecture.md)
- [Searcher 项目](/entities/searcher-项目.md)
