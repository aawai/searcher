---
type: entity
category: tool
title: "shadcn UI System"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-002, sources/SRC-2026-09-25-008]
---

# shadcn UI System

**shadcn UI System** 是 [[entities/searcher-项目]] 前端交互界面的标准组件体系规范。

## 设计原则与工程规范

1. **统一设计标准**：所有基础 UI 组件（如 Button、Dialog、Dropdown Menu、Sheet、Input 等）必须严格基于 shadcn/ui 官方原语和 registry 构建，禁止为常规功能重复造轮子。
2. **代码拥有权（Code Ownership）**：遵循 shadcn 架构理念，组件源码直接保存在 `web/src/components/ui/`，方便与项目自定义 Design Token 深度结合。
3. **样式 Token 体系**：基于 Tailwind CSS 与原生 CSS Token 变量，支持 Linear Dark 与空间微质感拟态，且与深浅色模式解耦。
4. **可访问性与热区**：交互元素触控热区保证不低于 44×44px，提供明确的键盘 Focus 环支持，并严格适配 `prefers-reduced-motion`。
5. **补充能力集成**：拖拽排序采用 dnd-kit 等成熟库，严格继承 Searcher Design Token 的圆角、边框与阴影，防止视觉割裂。

## 关联架构与文档

- [[entities/searcher-项目]]
- [[syntheses/searcher-system-architecture]]
- 官方架构介绍：[[sources/SRC-2026-09-25-008]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-008]]
