---
type: entity
category: project
title: "Searcher 项目"
created: 2026-09-25
updated: 2026-10-27
sources: [
    sources/SRC-2026-09-25-001,
    sources/SRC-2026-09-25-002,
    sources/SRC-2026-09-25-003,
    sources/SRC-2026-09-25-004,
]
---

# Searcher 项目

**Searcher** 是一个基于单进程同源部署的现代化个人搜索主页与工作台系统。

## 核心定位与特性

1. **同源单进程**：由 [[entities/deno-runtime]] 单一进程承载后端 API 与前端 SPA
   静态托管，践行 [[concepts/single-process-architecture]]。
2. **渐进式功能体验**：普通访客使用搜索和设置；匿名外观偏好保存在当前设备且不上传服务器，与账号缓存隔离。应用、笔记及跨设备偏好需要登录，见 [外观偏好存储](../../../docs/appearance.md#偏好存储)。
3. **安全严密设计**：管理员通过交互式命令行创建，会话实行严格的
   [[concepts/session-security-and-isolation]]，数据库操作经由
   [[concepts/database-queue-serialization]] 保护。

## 关联技术栈与架构规范

- 后端运行时：[[entities/deno-runtime]]
- Web 路由层：[[entities/hono-framework]]
- 数据持久化：[[entities/drizzle-sqlite-store]]
- 前端组件库：[[entities/shadcn-ui-system]]
- 样式与视口架构：[[concepts/tailwind-v4-css-first-architecture]]
- 弹出层与键盘流：[[concepts/modal-layering-and-escape-dismissal]]
- 事件流推送：[[concepts/server-sent-events-sse-与实时事件流]]
- 无障碍底线：[[concepts/pointer-target-size]]、[[concepts/accessible-grid-drag-keyboard-and-announcements]]、[[concepts/aria-combobox-grouped-suggestions]]
- 强调色与对比度：[[concepts/wallpaper-accent-oklch-contrast-solver]]
- 预览截断：[[concepts/whole-line-preview-truncation]]
- 数据库备份与恢复：[SQLite Backup and Recovery Boundaries](/concepts/sqlite-backup-and-recovery-boundaries.md)
- 样式变量语义：[CSS Custom Property Fallback and Registration](/concepts/css-custom-property-fallback-and-registration.md)
- 内容防护边界：[XSS Sanitization and Trusted Types](/concepts/xss-sanitization-and-trusted-types.md)
- 综合架构：[[syntheses/searcher-system-architecture]]
## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
