---
type: concept
title: Content Security Policy Strict Deployment
domain: engineering
created: 2026-10-30
updated: 2026-10-30
sources:
  - sources/SRC-2026-10-30-003
---

# Content Security Policy Strict Deployment

[MDN CSP 指南](/sources/SRC-2026-10-30-003.md)（[raw](../../raw/sources/SRC-2026-10-30-003/extracted.md)，第 217–242、582–717、774–893 行）把 CSP 拆成互相独立的四类用途，可以只部署其中一类：

| 用途 | 指令 | 说明 |
| --- | --- | --- |
| 控制资源加载（缓解 XSS） | `script-src` 等 fetch 指令 | 推荐 strict CSP：nonce 或 hash，加 `object-src 'none'; base-uri 'none'`；不推荐 allowlist |
| 防点击劫持 | `frame-ancestors 'none'` | 取代 `X-Frame-Options` |
| 升级不安全请求 | `upgrade-insecure-requests` | 迁移 HTTPS 期使用 |
| 要求 Trusted Types | `require-trusted-types-for 'script'`、`trusted-types` | 见 [XSS Sanitization and Trusted Types](/concepts/xss-sanitization-and-trusted-types.md) |

## 部署约束

- 须以响应头下发，且覆盖所有响应；`<meta>` 不支持全部特性，report-only 不能用 `<meta>`。
- nonce 需要每次响应生成；静态内容用 hash，脚本变动须重算。`'strict-dynamic'` 降低维护成本，但受信脚本若据 XSS 可控输入创建脚本，CSP 不再拦截。
- strict CSP 会阻止内联脚本、内联事件处理器、`javascript:` URL 和 `eval()`，须先重构这些用法。
- 先用 `Content-Security-Policy-Report-Only` 观察，违规报告优先 Reporting API（`Reporting-Endpoints` + `report-to`），`report-uri` 已弃用，在 `report-to` 全面支持前建议并存。
- CSP 不替代输入净化与输出编码；两者叠加才是纵深防御。

## Searcher 当前状态（2026-10-30）

对仓库全部文本文件（排除 `node_modules`、`.git`、`.llm-wiki`、`dist`）检索 `Content-Security-Policy` 与 `frame-ancestors`，无任何结果；响应头方面只在文档下载、壁纸和 WebApp 图标路由上发现 `X-Content-Type-Options: nosniff`，`/api` 响应设置 `Cache-Control: no-store`。因此项目目前没有配置 CSP 或 `frame-ancestors`，也没有 `X-Frame-Options`（后者仅检索 `src`、`web/index.html`、`web/vite.config.ts`，部署层如反向代理可能另有设置，未核实）。

是否部署、采用哪类策略，需要先盘点前端构建产物的内联脚本/样式与 `eval` 用法以及部署层响应头；该盘点未执行，本页不作建议结论。

## 关联

- [XSS Sanitization and Trusted Types](/concepts/xss-sanitization-and-trusted-types.md)
- [Session Security and Isolation](/concepts/session-security-and-isolation.md)
- [Single Process Architecture](/concepts/single-process-architecture.md)：应用与前端静态资源由同一进程提供，响应头可在应用内统一设置。
- [Hono Security Middleware Compared with Searcher's API Guard](/concepts/hono-security-middleware-vs-api-guard.md)：`secureHeaders()` 的 CSP/nonce 选项与项目 shell 为预构建静态文件的约束。
