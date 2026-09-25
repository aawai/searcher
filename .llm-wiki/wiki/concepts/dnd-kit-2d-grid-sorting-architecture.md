---
type: concept
title: "dnd-kit 2D Grid Sorting Architecture"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-009]
---

# dnd-kit 2D Grid Sorting Architecture (二维网格拖拽排序架构)

**dnd-kit 2D Grid Sorting Architecture** 指在 React 应用中利用 `@dnd-kit/sortable` 与现代 CSS Grid 协同实现多维复杂卡片布局拖拽排序的架构模式。在 [[entities/searcher-项目]] 的 Web App 工作台中，该模式成功解决了普通单体图标（1×1）与分组文件夹大卡片（2×2）混合排列时的空间排布与位移计算问题。

## 核心设计原则

### 1. 布局模型与拖拽变换解耦

- **静态布局归属 CSS Grid**：所有项的静态排布、自动跨行跨列（`grid-column: span 1/2`、`grid-row: span 1/2`）以及第二行后续项的自适应补位，完全由浏览器原生 CSS Grid 与 `grid-auto-flow: row` 自主计算。
- **动态位移归属 dnd-kit**：`@dnd-kit` 的 Hook `useSortable` 仅输出临时的 `transform`（如 `translate3d(x, y, 0)`）与 `transition`。静态坐标从不写死或通过 JS 计算，避免与 CSS 引擎产生冲突。

### 2. 避免密集重排（Dense Flow）与保证可预测性

- 尽管 CSS Grid 提供了 `grid-auto-flow: row dense` 特性用于自动填充空缺，但在可拖拽场景下，`dense` 会导致 DOM 物理顺序与屏幕视觉呈现顺序发生错乱。
- Searcher 坚持采用标准 `grid-auto-flow: row`，确保：
  $$\text{DOM 顺序} \equiv \text{视觉排布顺序} \equiv \text{SortableContext 注册顺序} \equiv \text{数据库规范排序 (Canonical Order)}$$
  拖拽重排结果完全稳定、可预期，杜绝视觉漂移或拖动跳位。

### 3. 基于真实 BoundingRect 的矩形排序策略

- 采用 `rectSortingStrategy`：在拖拽过程中，系统通过测量各项的实际尺寸进行碰撞与交换判断。即使 2×2 文件夹卡片的尺寸与普通 1×1 网站不同，dnd-kit 仍能准确计算出插值矢量。
- `SortableTile` 将 `setNodeRef` 绑定至填充了 100% 轨道的网格最外层节点，保证测量到的 Rect 与视觉卡片 100% 重合。

## 关联架构

- 交互引擎：[[entities/dnd-kit-system]]
- 宿主系统：[[entities/searcher-项目]]
- UI 呈现：[[entities/shadcn-ui-system]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-009]]
