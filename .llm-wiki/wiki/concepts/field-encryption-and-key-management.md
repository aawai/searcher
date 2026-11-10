---
type: concept
domain: engineering
title: Field Encryption and Key Management
created: 2026-11-07
updated: 2026-11-07
sources:
  - sources/SRC-2026-11-07-002
  - sources/SRC-2026-11-07-004
---

# Field Encryption and Key Management

## 来源原则

- [AesGcmParams](/sources/SRC-2026-11-07-002.md)：同一密钥下 IV 绝不复用，建议 96 位随机；`additionalData` 可选，被认证不加密；`tagLength` 默认 128。
- [OWASP Cryptographic Storage](/sources/SRC-2026-11-07-004.md)：AES-256 + GCM；密钥来自 CSPRNG；预先具备轮换能力（重新加密，或记录 key ID 保留旧钥）；密钥与数据分离；避免把密钥放在环境变量。

## Searcher 当前实现（2026-11-07 读码）

用途：加密 AI Provider API Key（[docs/ai.md](../../../docs/ai.md) 第 38 行写明 AES-256-GCM）。

- 密钥来源：`resolveEncryptionKey` 依次取显式参数、`ENCRYPTION_KEY`、`APP_KEY`、`APP_SECRET`（`features/ai/crypto.ts` 第 3–7 行）。显式参数来自 `AiServiceDeps.encryptionKey`；`src/main.ts`、`src/app.ts` 中未检索到对它的注入，因此生产路径读取环境变量，注入只在测试中使用（`ai.test.ts` 第 225 行）。
- 派生：`importHashedKey` 对密钥字符串做一次 SHA-256 得到 256 位 AES 密钥（`internal/crypto/primitives.ts` 第 25–40 行）；注释明确这不是面向低熵口令的 KDF，`CryptoVaultOptions.masterKey` 要求至少 32 随机字节的文本。
- 加密：每次 `crypto.getRandomValues` 生成 12 字节 IV，`{ name: "AES-GCM", iv }`，未传 `additionalData`，`tagLength` 用默认 128；密文格式 `v1:<iv hex>:<ciphertext hex>`（`internal/crypto/vault.ts` 第 138–159 行）。
- 解密：严格校验 envelope 格式，GCM 认证失败统一报 “invalid or tampered ciphertext”（第 161–191 行）。
- 盲索引：HMAC-SHA-256，密钥为 `blind-index-salt:` 前缀加主密钥后 SHA-256，与 AES 密钥分离（第 76–90、193–201 行）。

## 对照

| 来源要求 | 现状 |
| --- | --- |
| AES-256、认证模式、96 位随机 IV | 一致 |
| 密钥与数据分离 | 管理端 ZIP 备份不含 `ENCRYPTION_KEY`（AGENTS.md · 存储），密钥位于进程环境，数据位于 SQLite |
| 避免环境变量 | **不一致（生产路径）**：`CryptoVault` 与 `AiService` 支持注入密钥，但启动流程未注入，实际从环境变量读取；容器部署常这样做，OWASP 则建议避免 |
| 预先具备轮换 | **未具备**：`v1` 只是格式版本，不含 key ID；README 要求密钥“之后保持不变，否则既有 Key 无法解密”，未见重新加密路径 |
| AAD 绑定上下文 | 未使用；来源说明可省略而不损害加密安全。密文未与行 id 绑定，数据库内两条密文互换不会被 GCM 检测到——影响取决于威胁模型 [INFERENCE] |

## 未确认

- 是否有轮换或重新加密的 CLI/管理端操作：仅检索了 `vault.fields` 与密钥环境变量的引用，未发现，但未全面审计。
- IV 使用次数远低于随机 96 位 IV 的上限是推断（每条 Provider Key 一次加密），未统计。

## 关联

- [Password Hashing and PBKDF2 Parameters](/concepts/password-hashing-and-pbkdf2-parameters.md)：同一 `CryptoVault` 的口令哈希部分
- [SQLite Backup and Recovery Boundaries](/concepts/sqlite-backup-and-recovery-boundaries.md)
- [SSRF and Outbound Fetch Boundaries](/concepts/ssrf-and-outbound-fetch-boundaries.md)：Provider 请求拒绝重定向以免泄露 API Key
- [Searcher 项目](/entities/searcher-项目.md)
