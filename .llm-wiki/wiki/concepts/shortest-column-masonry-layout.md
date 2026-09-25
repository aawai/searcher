---
type: concept
title: Shortest Column Masonry Layout
domain: engineering
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-019, sources/SRC-2026-09-25-020, sources/SRC-2026-09-25-022, sources/SRC-2026-09-25-023, sources/SRC-2026-09-25-024]
---

# Shortest Column Masonry Layout (最短列贪心瀑布流布局)

**最短列贪心瀑布流布局**（Shortest-Column Masonry Layout）是现代前端应对**不定高、可动态折叠/展开元素**时的核心布局模式。在 [[entities/searcher-项目]] 的便签抽屉面板与卡片流中，该模式被用于彻底消除传统 CSS Grid 在单卡片过高时产生的同行大片空白。

## 1. 核心数学与计算模型

### 1.1 列数与列宽自适应
给定容器实际内容宽度 $W$、间距 $g$ 与基准列宽 $W_{\min}$，列数 $C$ 计算为：
$$C = \max\left(1, \min\left(C_{\max}, \left\lfloor \frac{W + g}{W_{\min} + g} \right\rfloor\right)\right)$$
在列数确定后，真实平分列宽 $W_c$ 为：
$$W_c = \begin{cases} W & C = 1 \\ \frac{W - (C - 1) \times g}{C} & C > 1 \end{cases}$$

### 1.2 最短列贪心定位
维护列累计高度数组 $H = [h_0, h_1, \dots, h_{C-1}]$（初始全为 0）。对于每个待放置元素 $i$（高 $h_i$）：
1. 寻找当前累计高度最小的列：$c^* = \arg\min_{c \in [0, C-1]} H[c]$；
2. 计算其绝对定位坐标：
   $$X_i = c^* \times (W_c + g)$$
   $$Y_i = H[c^*]$$
3. 更新该列累计高度：$H[c^*] \mathrel{+}= h_i + g$。

### 1.3 容器实际高度
为确保滚动容器 `.sheet-content` 的 `scrollHeight` 真实准确，容器高度计算为所有卡片底边缘的最大值：
$$\text{containerHeight} = \max_{i} (Y_i + h_i)$$

## 2. 工程实现与防御性设计

- **防死循环与 ResizeObserver 批处理**：
  监听容器宽度及每个卡片的实际渲染高度。仅当高度变化差值 $|h_{\text{new}} - h_{\text{old}}| \ge 1\text{px}$ 时记录变更，并通过 `requestAnimationFrame` 批处理防抖后写入 React 状态，彻底消除 `ResizeObserver loop completed with undelivered notifications` 警告；
- **双层 DOM 架构隔离 Transform**：
  外层 wrapper 负责 Masonry 坐标定位 `position: absolute; transform: translate3d(X, Y, 0); width: W_c` 以及平滑位移过渡 `transition: transform 200ms ease`；内层 wrapper 挂载 [[entities/dnd-kit-system]] 的 `useSortable`，互不覆盖 transform 属性；
- **拖拽与策略解耦**：
  配合 `SortableContext strategy={() => null}` 与 `<DragOverlay>`，拖拽期间仅渲染浮动副本，网格原位保持半透明占位，避免内置网格矩阵计算破坏瀑布流坐标。

## 3. 关联实体与概念

- [[entities/searcher-项目]]
- [[entities/dnd-kit-system]]
- [[concepts/dnd-kit-2d-grid-sorting-architecture]]
- [[sources/SRC-2026-09-25-019]]
- [[sources/SRC-2026-09-25-020]]
- 代码实现：[[sources/SRC-2026-09-25-022]]
- 单元测试：[[sources/SRC-2026-09-25-023]]
- 页面集成：[[sources/SRC-2026-09-25-024]]
