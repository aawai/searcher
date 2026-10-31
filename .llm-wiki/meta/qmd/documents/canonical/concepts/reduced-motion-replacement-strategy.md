---
type: concept
title: Reduced Motion Replacement Strategy
domain: engineering
created: 2026-10-31
updated: 2026-10-31
sources:
  - sources/SRC-2026-10-31-004
---

# Reduced Motion Replacement Strategy

[MDN](/sources/SRC-2026-10-31-004.md)（[raw](../../raw/sources/SRC-2026-10-31-004/extracted.md) 第 199–218、243–273 行）的指导：`reduce` 的目标是去掉**诱发前庭不适的位移/缩放**，不是取消所有反馈。示例把缩放换成纯透明度变化，覆盖规则与原规则同特异性并放在后面，靠源码顺序取胜。`reduce` 求值为 true，`no-preference` 为 false。

两种写法的取舍：

- **默认有动效、`reduce` 覆盖**：保证基线可用，但覆盖规则必须与原规则同特异性且在后。
- **默认无动效、`no-preference` 才添加**：用户未表态与不支持该特性的环境都得到无动效，覆盖顺序问题消失。

## Searcher 当前做法（2026-10-31 读取 `web/src`）

两种写法都存在，且规则的共同点是“保留透明度，去位移”：

| 文件 | 处理 |
| --- | --- |
| `styles/global.css` 第 329、369 行 | 路由 View Transition：关闭 `::view-transition-old/new(root)` 的动画；共享元素转场关闭 `group` 与 `image-pair` 的几何动画，仅 old/new 透明度可动 |
| `components/ui/primitives.css` 第 1125 行 | 开关滑块 `transition: none`；菜单、Popover、Tooltip 的进出场样式在 reduce 下改写 |
| `components/searcher/launcher.css` 第 380、567 行 | 文件夹拖放目标不缩放；弹窗锚点进出场 `transform` 固定 |
| `components/searcher/semantic.css` 第 402 行 | 状态横幅与撤销 Toast 的 `--feedback-travel: 0` |
| `features/dock/dock.css` 第 505 行 | `--dock-travel-x/y: 0px`，仅保留 opacity 过渡 |
| `features/workspace/documents-workspace.css` 第 104 行 | 文档抽屉 `transform: none; transition: none` |
| `features/documents/document-editor.css` 第 332 行 | `scroll-behavior: auto` |
| `features/ask/ask-workspace.css` 第 1062 行 | 工具卡箭头 `transition: none` |
| `features/home-layouts/home-notes.css` 第 22 行 | 反向写法：仅 `no-preference` 时才给便签位置添加过渡 |

JS 侧：`matchMedia("(prefers-reduced-motion: reduce)")` 只在 `design-lab/MotionLab.tsx` 出现；`web/src` 的 `.ts/.tsx` 中除 `design-lab` 外检索不到 `.animate(`（Web Animations）调用或 `motion` 库导入，因此当前没有需要在 JS 里单独读取该偏好的运行时动画。JS 驱动的动画（见 [Web Animations API Runtime Architecture](/concepts/web-animations-api-runtime-architecture.md)）不会被 CSS 媒体查询自动覆盖，日后引入时需自行读取 `matchMedia`。该结论基于文本检索，未核对拖拽库（dnd-kit）内部的 JS 动画。

## 关联

- [View Transitions Shared Element](/concepts/view-transitions-shared-element.md)：该页已记录共享元素转场的 reduce 处理。
- [Backdrop Filter Backdrop Root](/concepts/backdrop-filter-backdrop-root.md)：同样有 `prefers-reduced-transparency` 的用户偏好分支（`SettingsPage.tsx` 的 `REDUCED_TRANSPARENCY_QUERY`）。
