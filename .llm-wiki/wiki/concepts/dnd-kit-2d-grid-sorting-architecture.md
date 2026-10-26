---
type: concept
title: "dnd-kit 2D Grid Sorting Architecture"
created: 2026-09-25
updated: 2026-09-25
sources: [
    sources/SRC-2026-09-25-001,
    sources/SRC-2026-09-25-009,
    sources/SRC-2026-09-25-013,
    sources/SRC-2026-09-25-014,
    sources/SRC-2026-09-25-015,
    sources/SRC-2026-09-25-016,
    sources/obs-2026-09-25-web-app-launcher-grid-alignment-square-folder-architecture,
    sources/SRC-2026-09-25-026,
]
---

# dnd-kit 2D Grid Sorting Architecture (二维网格拖拽排序架构)

**dnd-kit 2D Grid Sorting Architecture** 指在 React 应用中利用
`@dnd-kit/sortable` 与现代 CSS Grid
协同实现多维复杂卡片布局拖拽排序的架构模式。在 [[entities/searcher-项目]] 的 Web
App
工作台中，该模式成功解决了普通单体图标（1×1）与分组文件夹大卡片（2×2）混合排列时的空间排布与位移计算问题。

## 核心设计原则

### 1. First-Fit 逻辑排版与原生 CSS Grid 轨道绑定

- **逻辑占位归属 First-Fit Occupancy Grid**：根据
  [[sources/SRC-2026-09-25-013]]，系统在纯内存中从左至右、从上至下扫描未被占用的单元格，给
  1×1 网站和 2×2 大文件夹精确分配 `(col, row, colSpan, rowSpan)`。
- **避免密集流（Dense Flow）错乱**：绝不依赖浏览器的 `grid-auto-flow: dense` 或
  Masonry 算法，确保：
  $$\text{规范数据顺序 (Canonical Order)} \longleftrightarrow \text{First-Fit 逻辑占位} \longleftrightarrow \text{CSS Grid 轨道绝对定位}$$
  从根本上杜绝了拖拽重排时视觉漂移与布局回跳问题。

### 2. 容器感知与纯数学列数推导 (ResizeObserver)

- 依据 [[sources/SRC-2026-09-25-014]]，网格列数通过 `useDesktopColumns` 监听实际
  `.launcher-grid` 容器的宽度，根据 `(width + col_gap) / (col_w + col_gap)`
  进行纯数学推导（至少 2 列）。
- 依据 [[sources/SRC-2026-09-25-016]]，在 React 组件的 `useEffect` 清理阶段执行
  `observer.disconnect()`，保证了路由跳转与抽屉频繁启闭时的零内存泄漏。

### 3. 正方形主体与独立排版流 (Aspect-Ratio)

- **主体锚定列宽**：小文件夹主体占 1
  列宽度（`width: 100%`），大文件夹占两列并跨越一个列间距（`2 * col_w + gap_x`），两者均通过
  `aspect-ratio: 1` 成为严格的几何正方形（详见实战观察
  [[sources/obs-2026-09-25-web-app-launcher-grid-alignment-square-folder-architecture]]）。
- **名称外置与间距统一**：文件夹名称放置在正方形主体下方，与普通快捷方式保持相同的
  6px 间距，不侵入、不撑大正方形主体的高宽比。

### 4. 稳定的 Key 与状态保留

- 依据 [[sources/SRC-2026-09-25-015]]，所有可拖拽网格节点均以实体的规范全局唯一
  ID（`app.id` 或 `folder.id`）作为
  key，确保在过滤、多尺寸切换与拖拽重排过程中，局部交互与上下文菜单状态平稳保留。

### 5. 与不定高瀑布流架构的对比 (Null-Strategy Pattern)

相较于 Web App 规整二维网格使用的 First-Fit CSS Grid 轨道绑定与
`strategy={() => null}` +
DragOverlay，在不定高便签场景下，系统演进出了更为动态的
[[concepts/shortest-column-masonry-layout]]：

- **布局差异**：Web App 依赖离散整倍数网格单元（1×1 /
  2×2），而便签面板采用基于实际渲染高度的最短列贪心累加（`colHeights`）；
- **拖拽协同**：两者均采用 `SortableContext strategy={() => null}`
  避免内置网格变换干扰，并通过 `<DragOverlay>` 消除局部重排抖动（详见
  [[sources/SRC-2026-09-25-020]]）；
- **碰撞策略**：便签面板引入 `pointerWithin` 优先结合 `closestCenter`
  回退，并在拖拽释放时依据指针相对卡片中心的 Y
  轴位置计算前后插入点，同时受到置顶分区边界的严格约束。

## 关联架构

- 交互引擎：[[entities/dnd-kit-system]]
- 宿主系统：[[entities/searcher-项目]]
- UI 呈现：[[entities/shadcn-ui-system]]
- 无障碍：[[concepts/accessible-grid-drag-keyboard-and-announcements]]

## 来源与观察

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-009]]
- [[sources/SRC-2026-09-25-013]]
- [[sources/SRC-2026-09-25-014]]
- [[sources/SRC-2026-09-25-015]]
- [[sources/SRC-2026-09-25-016]]
- 实战观察：[[sources/obs-2026-09-25-web-app-launcher-grid-alignment-square-folder-architecture]]
- [[sources/SRC-2026-09-25-026]]
- [[sources/SRC-2026-10-25-005]]
