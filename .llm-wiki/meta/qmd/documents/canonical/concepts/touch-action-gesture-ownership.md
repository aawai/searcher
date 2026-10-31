---
type: concept
title: Touch Action Gesture Ownership
domain: engineering
created: 2026-10-31
updated: 2026-10-31
sources:
  - sources/SRC-2026-10-31-003
---

# Touch Action Gesture Ownership

`touch-action` 声明“哪些手势归浏览器”，其余归页面的 Pointer Events 处理（[来源](/sources/SRC-2026-10-31-003.md)，[raw](../../raw/sources/SRC-2026-10-31-003/extracted.md) 第 199–206 行）。三条决定实现方式的规则：

1. 自定义拖拽必须让浏览器放弃相关手势，否则浏览器接管平移时会发出 `pointercancel`，拖拽中断。
2. 有效值是元素到负责该手势的滚动容器之间各层声明的**交集**，只需标在自定义行为的元素上；`none` 不会被子元素的 `auto` 抵消。
3. 手势开始后修改不影响当次手势，因此“拖拽开始才设 `none`”对本次拖拽无效，必须预先声明。

`manipulation` 还有一项副作用：禁用双击缩放后浏览器无需等待判断双击，`click` 不再被延迟（第 264 行）。`none` 会让低视力用户无法缩放（第 274 行）。

## Searcher 当前使用（2026-10-31 读取 `web/src`）

| 值 | 位置（样式文件） | 用途 |
| --- | --- | --- |
| `none` | `features/windowing/window-frame.css` 第 46、127 行 | 窗口标题栏（拖动）与缩放手柄 |
| `none` | `components/searcher/pane-resize-handle.css` 第 8 行 | 分栏拖拽手柄 |
| `none` | `features/dock/dock.css` 第 423 行 | 悬浮球式 Dock 触发件 |
| `none` | `components/searcher/launcher.css` 第 276 行 | 仅在 `.is-managing`（管理模式）下的图标与文件夹，普通浏览态不设 |
| `none` | `app/settings.css` 第 446 行 | 壁纸预览（拖选焦点）区 |
| `none` | `components/ui/primitives.css` 第 240 行 | 滑块 |
| `pan-x pan-y` | `features/dock/dock.css` 第 62 行 | Dock 条本身：允许单指平移，不含 `pinch-zoom` |
| `manipulation` | `features/home-layouts/home-notes.css` 第 19 行、`app/settings.css` 第 689 行 | 首页便签、预设滑块刻度点 |

观察：

- 启动器的 `touch-action: none` 仅限管理模式，与“拖拽只在管理态启用”一致，浏览态仍可在图标上平移滚动。这是读代码所得，未在设备上验证。
- `pan-x pan-y` 的 Dock 条没有 `pinch-zoom`，即在该元素上起手的双指捏合不会缩放页面；其余元素不受影响，因为计算的是触点所在元素链的交集。是否构成可达性问题取决于 Dock 条的面积，本页不下结论。
- `none` 的元素多为窗口标题栏、手柄等小面积控件，与 MDN 对“整页禁止缩放”的警告不同量级；但视口 `<meta name="viewport">` 为 `width=device-width, initial-scale=1.0`（`web/index.html`），未禁用用户缩放。

## 关联

- [Pointer Target Size](/concepts/pointer-target-size.md)
- [Accessible Grid Drag, Keyboard and Announcements](/concepts/accessible-grid-drag-keyboard-and-announcements.md)
- [dnd-kit 2D Grid Sorting Architecture](/concepts/dnd-kit-2d-grid-sorting-architecture.md)
- [Overscroll Containment for Nested Scroll Areas](/concepts/overscroll-containment-for-nested-scroll-areas.md)
