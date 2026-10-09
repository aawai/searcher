---
type: entity
title: shadcn UI System
category: tool
created: 2026-09-25
updated: 2026-09-27
sources:
  - sources/SRC-2026-09-25-001
  - sources/SRC-2026-09-25-002
  - sources/SRC-2026-09-25-008
  - sources/SRC-2026-09-26-001
  - sources/SRC-2026-09-27-001
  - sources/SRC-2026-09-27-002
---

# shadcn UI System

**shadcn UI System** 是 [[entities/searcher-项目]]
前端交互界面的标准组件体系规范。

## 设计原则与工程规范

1. **统一设计标准**：所有基础 UI 组件（如 Button、Dialog、Dropdown
   Menu、Sheet、Input 等）必须严格基于 shadcn/ui 官方原语和 registry
   构建，禁止为常规功能重复造轮子。
2. **代码拥有权（Code Ownership）**：遵循 shadcn 架构理念，组件源码直接保存在
   `web/src/components/ui/`，方便与项目自定义 Design Token 深度结合。
3. **样式 Token 体系**：基于 Tailwind CSS 与原生 CSS Token 变量，支持 Linear
   Dark 与空间微质感拟态，且与深浅色模式解耦。
4. **可访问性与热区**：交互元素触控热区保证不低于 44×44px，提供明确的键盘 Focus
   环支持，并严格适配 `prefers-reduced-motion`。
5. **补充能力集成**：拖拽排序采用 dnd-kit 等成熟库，严格继承 Searcher Design
   Token 的圆角、边框与阴影，防止视觉割裂。
6. **Headless 原语可访问性传递**：对于 Slider 等复合组件，交互状态与隐藏表单输入由 `@base-ui/react` 等底层原语维护；由于 Root 的 `aria-label` 仅作用于容器 group `<div>`，外部传入的 `aria-label` 必须显式穿透至具体的 `Thumb` 实例，以确保无障碍树中的 `<input type="range">` 具备标准 accessible name。
7. **弹出层堆叠与 Escape 逐层回退**：在工作区面板、下钻子文件夹与确认对话框多层嵌套时，遵循后进先出（LIFO）的关闭顺序，子视图关闭不连带关闭主面板；子级弹窗自动抑制重复 Backdrop，活动面板在 Glass 模式下强制使用不透明实底，避免文字透叠。
8. **动态视口与短屏自适应**：全屏抽屉与工作台统一结合 Tailwind v4 的 `dvh` / `svh` 动态视口单位与 `flex-col min-h-0` 滚动隔离，保证短屏与移动端键盘弹出时底部操作栏常驻可见。

## 关联概念与架构

- [[concepts/modal-layering-and-escape-dismissal]]
- [[concepts/tailwind-v4-css-first-architecture]]
## 关联架构与文档

- [[entities/searcher-项目]]
- [[syntheses/searcher-system-architecture]]
- 官方架构介绍：[[sources/SRC-2026-09-25-008]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-008]]
- [[sources/SRC-2026-09-26-001]]
- [[sources/SRC-2026-09-27-001]]
- [[sources/SRC-2026-09-27-002]]
