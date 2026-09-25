---
type: entity
category: library
title: "dnd-kit System"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-005, sources/SRC-2026-09-25-009]
---

# dnd-kit System

**dnd-kit** 是现代 React 前端生态中轻量、高性能、高度可扩展且无障碍优先（A11y First）的拖放交互工具套件。在 [[entities/searcher-项目]] 中，它与原生 CSS Grid 及便签系统紧密配合，承载了桌面端与移动端的核心拖放排序能力。

## 关键机制与项目实现

1. **核心依赖组合**：
   - `@dnd-kit/core`：提供顶层 `DndContext` 状态总线、碰撞检测算法（`closestCenter`）、指针传感器（`PointerSensor`）与键盘传感器（`KeyboardSensor`）。
   - `@dnd-kit/sortable`：提供二维网格排序上下文 `<SortableContext>`、排序策略（`rectSortingStrategy`）与用于重排的不可变数组工具 `arrayMove`。
   - `@dnd-kit/utilities`：提供 CSS 变换工具类 `CSS.Transform.toString(transform)`。
2. **Web App 磁贴与文件夹二维排序**：
   在 `WebAppLauncher.tsx` 中，普通应用图标（1×1）与文件夹卡片（2×2）共处于同一个平铺网格容器内。`SortableTile` 将 `useSortable` 的 `ref` 绑定在最外层网格容器上，通过 `rectSortingStrategy` 实时测量真实布局边界，结合 [[concepts/dnd-kit-2d-grid-sorting-architecture]] 实现了无跳跃、无错位的二维网格平滑重排。
3. **便签自由拖拽与层级提升**：
   在 `FloatingNotes.tsx` 中，利用 `useDraggable` 处理首页固定便签的视口绝对拖拽，拖动时自动提升图层层级（`z-index`），释放后持久化局部或服务端坐标。
4. **防误触与无障碍兼备**：
   通过配置 `activationConstraint: { distance: 8 }`，确保单击打开网页与长按/拖拽排序的意图完全分离；内置键盘方向键坐标解析器 `sortableKeyboardCoordinates`，支持无障碍键盘排序。

## 关联架构

- 二维网格排序概念：[[concepts/dnd-kit-2d-grid-sorting-architecture]]
- 宿主系统：[[entities/searcher-项目]]
- UI 交互契约：[[entities/shadcn-ui-system]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-005]]
- [[sources/SRC-2026-09-25-009]]
