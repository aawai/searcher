---
type: concept
title: Single Process Architecture
domain: engineering
created: 2026-09-25
updated: 2026-09-25
sources:
  - sources/SRC-2026-09-25-001
  - sources/SRC-2026-09-25-002
  - sources/SRC-2026-09-25-003
  - sources/SRC-2026-09-25-004
---

# Single Process Architecture (单进程同源架构)

**单进程同源架构**是 [[entities/searcher-项目]]
的核心系统拓扑设计模式。该模式将静态资源托管、单页应用（SPA）前端路由分发、REST
API 服务端点以及本地嵌入式数据库集成在一个单一的 [[entities/deno-runtime]]
服务进程中运行。

## 架构优势与设计细节

1. **同源部署（Same-Origin）**：前端客户端与后端接口处于完全相同的
   Origin（主机、端口、协议），完全规避了跨域（CORS）配置风险，并且天然契合
   HttpOnly Cookie 的安全传输策略。
2. **零反向代理要求**：借助 [[entities/hono-framework]]
   的静态文件服务能力，生产环境下直接托管 `web/dist`，白名单路由（如
   `/`、`/settings`、`/admin`）直接回退渲染 `index.html`，无需在前端部署 Nginx
   或额外的 CDN 网关即可独立运行。
3. **运维与启动极简**：只需一个简单的 `deno task start`
   即可拉起全栈服务，极大降低了私有化部署和本地主页工具的运维复杂度。

## 关联页面

- 项目应用：[[entities/searcher-项目]]
- 框架选型：[[entities/hono-framework]]
- 综合总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-004]]
