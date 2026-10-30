---
type: concept
title: Password Hashing and PBKDF2 Parameters
domain: engineering
created: 2026-10-30
updated: 2026-10-30
sources:
  - sources/SRC-2026-10-30-001
---

# Password Hashing and PBKDF2 Parameters

[OWASP 口令存储指南](/sources/SRC-2026-10-30-001.md)（[raw](../../raw/sources/SRC-2026-10-30-001/extracted.md)，第 247–257、321–333、403–427 行）的最低配置：Argon2id 首选（m=19456 KiB、t=2、p=1）；需要 FIPS-140 时用 PBKDF2-HMAC-SHA-256，600,000 次迭代；工作因子须实测，单次哈希一般应少于 1 秒；升级策略是用户下次登录时重新哈希，参数随哈希保存以便混合期共存。

## Searcher 当前实现（2026-10-30 读取源码）

- [`CryptoVault`](../../../src/internal/crypto/vault.ts) 用 Web Crypto PBKDF2，摘要为 SHA-256（[`primitives.ts`](../../../src/internal/crypto/primitives.ts)），16 字节随机盐，存储格式 `pbkdf2:v1:<迭代次数>:<盐 hex>:<哈希 hex>`；迭代次数写在哈希里，与指南建议的“参数随哈希保存”一致。
- [`AuthService`](../../../src/features/auth/service.ts) 未注入 vault 时以 `passwordIterations: 600_000` 构造，与指南对 PBKDF2-HMAC-SHA-256 的最低值一致。`CryptoVault` 自身默认值为 100,000（上限 1,000,000），因此迭代次数取决于调用方是否传入。
- 校验先限制哈希长度（>115 直接失败）与迭代次数（>1,000,000 失败），再用 `timingSafeEqual` 比较；不存在的用户用预计算 dummy hash 走同样的 PBKDF2，降低时间差。
- 口令长度限制为 12–128 个字符（[`contracts.ts`](../../../src/shared/contracts.ts) 第 13 行；`v.maxLength` 按字符计，不是字节）。该上限有界化了单次哈希输入，与指南对长口令放大开销的提示相关，但本页未测量实际成本。

## 未确认

- 源码中未检索到校验成功后按当前迭代次数重新哈希的路径（`rehash`/`upgrade` 检索无结果）；已有哈希的迭代次数不会随默认值提升而自动更新。
- 项目选择 PBKDF2 而非 Argon2id 的原因没有记录；指南只把 PBKDF2 列为需要 FIPS-140 时的首选，并未说明它在无此要求时的优劣之外的定位。是否记录了该约束，须查看设计文档，本页未核实。
- 600,000 次迭代在目标服务器上的单次耗时、并发登录下的 CPU 占用均未测量。

## 关联

- [Session Security and Isolation](/concepts/session-security-and-isolation.md)：会话令牌用 SHA-256 保存，与口令哈希使用不同机制；OWASP 会话指南明确高熵令牌不需要口令哈希算法。
- [Searcher 项目](/entities/searcher-项目.md)
