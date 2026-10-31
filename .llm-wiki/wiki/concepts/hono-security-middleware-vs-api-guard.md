---
type: concept
domain: engineering
title: Hono Security Middleware Compared with Searcher's API Guard
created: 2026-10-31
updated: 2026-10-31
sources:
  - sources/SRC-2026-10-31-001
  - sources/SRC-2026-10-31-002
---

# Hono Security Middleware Compared with Searcher's API Guard

Hono 内置 `secureHeaders()`（[来源](/sources/SRC-2026-10-31-001.md)）与 `csrf()`（[来源](/sources/SRC-2026-10-31-002.md)）。本页只对照它们的行为契约与项目现有实现，不构成安全审计，也不建议替换。

## 内置 `csrf()` 的校验范围

- 触发条件：方法不是 GET/HEAD/OPTIONS，**且** `Content-Type` 属于 `application/x-www-form-urlencoded`、`multipart/form-data`、`text/plain`（[raw](../../raw/sources/SRC-2026-10-31-002/extracted.md) 第 5–8 行）。即 `application/json` 的跨站请求不在其检查范围内（JSON 跨站请求本身需要 CORS preflight）。
- 放行条件：`Origin` 校验或 `Sec-Fetch-Site` 校验任一通过（第 3 行）。默认 `origin` 为请求 URL 同源，`secFetchSite` 默认只放行 `same-origin`。
- 已知限制：不发 `Origin` 的旧浏览器、剥离该头的反向代理（第 10 行）。

## 项目现状（2026-10-31 读取 `src/`）

`src/features/auth/security.ts` 的 `createApiSecurityMiddleware`（由 `src/app.ts` 第 80 行挂在 `/api/*`）：

| 项 | 项目实现 | 内置 `csrf()` |
| --- | --- | --- |
| 受检方法 | POST、PATCH、PUT、DELETE | 非 GET/HEAD/OPTIONS |
| 内容类型前提 | 无；所有受检方法都校验 `Origin` | 仅表单类三种 |
| Origin 比较 | 与启动时校验过的 `APP_ORIGIN` 严格相等；缺失即 403 | 同源，或自定义 string/array/function |
| `Sec-Fetch-Site` | 全仓 `src` 未检索到 | 默认参与，可单独配置 |
| 附加 | `/api` 响应一律 `Cache-Control: no-store`；有请求体时 `Content-Type` 须为 `application/json`（multipart 路由须 `multipart/form-data`），否则 415 | 无 |

结论仅限事实：项目的 Origin 守卫覆盖面比内置中间件的触发条件更宽，且不依赖 Fetch Metadata；`src` 中没有引用 `hono/csrf` 或 `hono/secure-headers`（`grep` 结果为空）。对 `APP_ORIGIN` 的精确匹配也让部署必须使用与浏览器地址一致的 origin；该约束写在 `src/main.ts` 的启动校验里。

内置中间件的函数式 `origin` 文档提醒“用 `$` 锚定、绝不做前缀匹配”（[raw](../../raw/sources/SRC-2026-10-31-002/extracted.md) 第 44–53 行）；项目使用严格相等，不存在该类前缀问题。

## 内置 `secureHeaders()` 与项目响应头

`secureHeaders()` 默认下发 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy: no-referrer`、`Strict-Transport-Security`、COOP/CORP 等；CSP、Permissions-Policy 默认不设（[raw](../../raw/sources/SRC-2026-10-31-001/extracted.md) 第 53–74 行）。

项目目前只在文档下载、壁纸、WebApp 图标三类路由上手工设置 `nosniff`（`documents.route.ts`、`wallpaper.route.ts`、`webapp-icons.route.ts`）；`src` 内未检索到 `Referrer-Policy`、`X-Frame-Options`、`frame-ancestors`、`Strict-Transport-Security`。部署层（反向代理）是否补齐这些头，仓库内无法确认，需要看实际响应。

若要采用，须注意的事实：

- 默认 `X-Frame-Options: SAMEORIGIN` 与 `Referrer-Policy: no-referrer` 会影响嵌入与外链的 `Referer`；`Cross-Origin-Resource-Policy: same-origin` 会阻止其他站点加载本站资源（包括公开的 WebApp 图标路由被跨站引用的场景，是否存在此类使用未核实）。
- 全局注册还会改变 `/assets/*` 与 SPA shell 的响应头，需单独验证 Service Worker 与缓存行为，见 [HTTP Cache and Service Worker Boundaries](/concepts/http-cache-and-service-worker-boundaries.md)。
- CSP 的 nonce 方案要求逐请求渲染 HTML；项目 shell 是预构建静态文件（`web/dist`），nonce 无处注入，只能用 hash 或不带内联脚本的策略，见 [Content Security Policy Strict Deployment](/concepts/content-security-policy-strict-deployment.md)。

## 关联

- [CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)
- [Hono Middleware Pipeline and Request Intake](/concepts/hono-middleware-pipeline-request-intake.md)
- [Hono Framework](/entities/hono-framework.md)
