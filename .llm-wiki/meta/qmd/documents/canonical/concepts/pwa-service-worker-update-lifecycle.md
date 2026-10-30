---
type: concept
title: PWA Service Worker Update Lifecycle
domain: engineering
created: 2026-10-24
updated: 2026-10-28
sources:
  - sources/SRC-2026-10-24-007
  - sources/SRC-2026-10-24-008
  - sources/SRC-2026-10-28-001
  - sources/SRC-2026-10-28-002
---

# PWA Service Worker Update Lifecycle (PWA 外壳缓存与版本切换)

[[entities/searcher-项目]] 的 PWA 层只缓存应用外壳与带指纹的静态资源，Service Worker 不拦截 API；版本切换必须保证"同一页面只由一个构建版本服务"。不拦截并不等于绕过浏览器 HTTP 缓存，见 [HTTP Cache and Service Worker Boundaries](/concepts/http-cache-and-service-worker-boundaries.md)。

## 1. 生命周期约束

| 阶段 | 规范行为 | 对外壳缓存的含义 |
|---|---|---|
| `install` | `waitUntil` 失败即丢弃新 worker，旧 worker 继续服务 | 预缓存失败不会破坏现有版本 |
| `waiting` | 旧 worker 控制的 client 数降为 0 前不激活；刷新时新旧页面重叠 | 单次刷新无法切换，需显式激活 |
| `activate` | 适合清理旧缓存；`waitUntil` 缓冲 fetch | 按版本名删除过期缓存 |
| `skipWaiting()` | 立刻激活，接管旧版本加载的页面 | 只能由用户确认触发 |

来源：[[sources/SRC-2026-10-24-007]]。

## 2. Searcher 实现映射（`web/src/pwa/`）

- `install`：从服务端取 shell HTML，校验其引用资产与构建期注入的 `__SW_SHELL_ASSETS__` 完全一致，否则抛错放弃安装（防止把另一构建的 shell 缓存进本版本）。
- `activate`：删除 `isStaleShellCache(name, __SW_VERSION__)` 判定的旧缓存，再 `clients.claim()`。
- `message`：`{type: "activate"}` → `skipWaiting()`；`{type: "build"}` 通过 MessagePort 回报版本与资产清单。
- 注册：`updateViaCache: "none"`，监听 `updatefound` / `controllerchange` / `visibilitychange`；已有 controller 且存在 `waiting` 时提示"新版本已就绪 · 刷新"。新打开的页面直接使用新版本。
- 路由：资产 cache-first，页面 network-first、离线回退 shell；API 不由 Service Worker 缓存。

## 3. Web Share Target

`share_target` 只在已安装 PWA 上生效，每个 manifest 只能有一个（[[sources/SRC-2026-10-24-008]]）。Searcher 采用 `GET /share`：POST 目标会在 API 的 Origin 检查之外提交数据；落地页把 title/text/url 归一化为一条笔记，未登录时内容只保留在当前标签页，登录后再写入（见 [[concepts/session-security-and-isolation]]）。

## 4. 失败模式

- 给 SW 脚本换 URL：旧 SW 缓存的 HTML 持续注册旧 URL，永远无法更新。
- 无条件 `skipWaiting()`：同一页面的前后请求由不同版本处理，懒加载 chunk 可能 404。
- 缓存名无前缀：同源多应用时 `activate` 可能误删他人缓存。

## 关联

- [[concepts/offline-first-与-local-draft-持久化架构]]
- [[concepts/route-level-code-splitting-dynamic-bundling]]
- [Browser Storage Persistence and Eviction](/concepts/browser-storage-persistence-and-eviction.md)
- [[entities/vite-bundler]]
