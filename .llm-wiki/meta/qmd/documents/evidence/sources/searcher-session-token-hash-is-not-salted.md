---
type: source
title: Searcher 会话 Token 使用无盐 SHA-256
status: insight
category: security
created: 2026-10-29
updated: 2026-10-29
slug: searcher-session-token-hash-is-not-salted
---

# Searcher 会话 Token 使用无盐 SHA-256

[Searcher 认证实现](../../../src/features/auth/service.ts) 以 `crypto.getRandomValues` 生成 32 字节随机会话 Token，将其 SHA-256 哈希存入 sessions；这里没有额外 salt。不要把这一高熵随机凭证的存储方式与用户密码哈希混为一谈，也不要把哈希存储表述成能消除所有凭证泄露风险。详见 [[concepts/session-security-and-isolation]] 和 [[sources/SRC-2026-10-29-001]]。

*Category: security*

---
*Captured: 2026-10-29*

## Related

- [Session Security and Isolation](/concepts/session-security-and-isolation.md)
- [MDN Secure cookie configuration](/sources/SRC-2026-10-29-001.md)
