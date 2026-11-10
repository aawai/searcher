---
type: concept
title: SSRF and Outbound Fetch Boundaries
domain: engineering
created: 2026-11-07
updated: 2026-11-07
sources:
  - sources/SRC-2026-11-07-003
  - sources/SRC-2026-11-07-001
---

# SSRF and Outbound Fetch Boundaries

## 来源原则

[OWASP SSRF Cheat Sheet](/sources/SRC-2026-11-07-003.md)：用户可控 URL 由服务端抓取属于 Case 2（任意外部地址），只能 block-list；必须禁用重定向、解析全部 A + AAAA 并逐一校验，且**连接到已校验 IP**——仅校验 DNS 答案挡不住 DNS rebinding。

## Searcher 出站请求面（2026-11-07 读码）

| 出站请求 | 目标由谁决定 | 已观察到的防护 | 位置 |
| --- | --- | --- | --- |
| 应用图标/站点 HTML/manifest、AI 生成图片下载 | 登录用户输入或远端 HTML | `validateUrlForSafeFetch`：仅 http/https、禁 userinfo、拒绝 `localhost`/`.local`/`.internal`/`.lan`、IPv4 私有与保留段、解析 A + AAAA 后全部须为公网；`redirect: "error"`、超时、流式体积上限 | `features/webapp-icons/ssrf.ts`、`fetcher.ts` 第 129–201 行、`features/ai/images.ts` 第 237 行 |
| AI Provider `/models`、`/chat/completions` | Provider 配置的 Base URL | `normalizeBaseUrl`：只允许公网 HTTPS 或 loopback HTTP（`localhost`、`127.0.0.1`、`[::1]`、`100.78.0.1`），拒绝其他 IP 字面量与 `.local/.internal/.localhost`；`redirect: "error"` 防止携带 API Key 的重定向 | `features/ai/client.ts` 第 48–70 行、`provider-adapter.ts` 第 261、354 行 |
| SearXNG 联网搜索 | 服务端环境变量 `SEARXNG_URL` | 运营者配置，非用户输入；见 [SearXNG Web Search Integration](/concepts/searxng-web-search-integration.md) | `features/ai/tools.ts` 第 264–297 行 |
| 搜索建议 | 代码内固定的上游搜索引擎 URL | 不由用户决定主机 | `features/search/adapters.ts` |

## 已验证的边界行为

2026-11-07 用 `deno eval` 直接调用 `ssrf.ts` 得到：

- `http://2130706433/`、`http://0x7f.1/` 经 WHATWG URL 规范化为 `127.0.0.1`，被直接 IP 检查拒绝——编码绕过在解析层已被消除。
- `new URL("http://[::1]/").hostname` 是带方括号的 `[::1]`，`isPrivateOrRestrictedIp("[::1]")` 返回 `false`；`[::ffff:127.0.0.1]` 规范化为 `[::ffff:7f00:1]`，同样返回 `false`。默认配置下它们仍被拒绝，但原因是 `Deno.resolveDns` 对该字面量无结果、触发“未解析到公开 IP”。`allowDnsLookup: false` 时两者均**被放行**；生产调用均用默认值，只有测试传 `false`。
- `isPrivateOrRestrictedIp("::ffff:7f00:1")` 与 `("64:ff9b::7f00:1")` 返回 `false`：十六进制形式的 IPv4-mapped 地址与 NAT64 前缀未识别。`Deno.resolveDns(…, "AAAA")` 是否会以这种形式返回映射地址未验证。

## 差异与未决问题

- `ssrf.ts` 注释已承认：校验与连接之间的 DNS rebinding 未消除。来源要求连接到已校验 IP 并保留 Host/SNI；`fetch` 不提供该能力，需要自定义连接层，属于设计决定，本轮未改代码。
- IPv6 字面量拒绝依赖 DNS 查询失败而非显式规则；同理，公网 IPv6 字面量 URL 也会被拒。
- Provider Base URL 不做 DNS 解析检查：解析到私有地址的公网域名可通过 `normalizeBaseUrl`。Provider 由谁配置（管理员或普通用户）本页未核实，因此风险等级未定。loopback 白名单中的 `100.78.0.1` 属于 `100.64.0.0/10` 共享地址段，加入原因无记录。
- 本页是读码与本地函数调用，不是安全审计或渗透测试。

## 关联

- [Upload Validation Defense in Depth](/concepts/upload-validation-defense-in-depth.md)
- [AbortController and Request Cancellation in Searcher](/concepts/abortcontroller-and-request-cancellation.md)
- [Field Encryption and Key Management](/concepts/field-encryption-and-key-management.md)
- [Searcher 项目](/entities/searcher-项目.md)
