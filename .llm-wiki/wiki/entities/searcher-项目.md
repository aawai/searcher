---
type: entity
category: project
title: "Searcher 项目"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-002, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-004]
---

# Searcher 项目

**Searcher** 是一个基于单进程同源部署的现代化个人搜索主页与工作台系统。

## 核心定位与特性

1. **同源单进程**：由 [[entities/deno-runtime]] 单一进程承载后端 API 与前端 SPA 静态托管，践行 [[concepts/single-process-architecture]]。
2. **渐进式功能体验**：普通访客享受纯粹快速的搜索体验，匿名偏好不落盘；登录后开放 Web App 抽屉面板、Markdown 便签、AI 问答服务与跨设备同步。
3. **安全严密设计**：管理员通过交互式命令行创建，会话实行严格的 [[concepts/session-security-and-isolation]]，数据库操作经由 [[concepts/database-queue-serialization]] 保护。

## 关联技术栈

- 后端运行时：[[entities/deno-runtime]]
- Web 路由层：[[entities/hono-framework]]
- 数据持久化：[[entities/drizzle-sqlite-store]]
- 前端组件库：[[entities/shadcn-ui-system]]
- 综合架构：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
