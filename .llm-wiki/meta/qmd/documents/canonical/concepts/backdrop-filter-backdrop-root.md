---
type: concept
title: Backdrop Filter Backdrop Root
domain: engineering
created: 2026-10-30
updated: 2026-10-30
sources:
  - sources/SRC-2026-10-30-004
---

# Backdrop Filter Backdrop Root

[MDN backdrop-filter](/sources/SRC-2026-10-30-004.md)（[raw](../../raw/sources/SRC-2026-10-30-004/extracted.md)，第 198、297–315 行）：滤镜只作用于元素背后、直到最近 **backdrop root** 之间已绘制的内容。以下任一条件使元素成为 backdrop root：根元素；`filter` 非 `none`；`opacity` < 1；`mask`/`mask-image`/`mask-border`/`clip-path` 非 `none`；`backdrop-filter` 非 `none`；`mix-blend-mode` 非 `normal`；`will-change` 指向这些属性。

后果：玻璃面板的任一祖先带 `opacity < 1`、`filter`、`clip-path` 或 `mask`，面板的模糊就只采样该祖先内部的内容，看不到祖先背后的壁纸，表现为“样式正确却没有效果”。让祖先半透明（如淡入淡出动画）会临时改变采样范围。

## Searcher 当前状态（2026-10-30 读取源码）

- 玻璃材质通过 `--material-filter` 施加 `backdrop-filter`（[primitives.css](../../../web/src/components/ui/primitives.css) 第 505–506、1083–1084 行）；[tokens.css](../../../web/src/design-system/tokens.css) 第 544–572 行在浏览器不支持 `backdrop-filter` 或 `prefers-reduced-transparency: reduce` 时把各档位退回 `off`（不透明背景、`--material-filter: none`），与 MDN 所述“效果依赖半透明背景”的前提一致。
- 壁纸层 `.wallpaper-surface` 与 `.app-shell` 都建立了 `isolation: isolate`；`isolation` 不在 MDN 列出的 backdrop root 条件内。
- 未做的核查：各玻璃面板的祖先链上是否存在 `opacity < 1`、`filter`、`clip-path`、`mask` 或 `will-change` 指向它们的元素（包括窗口出现/消失动画）。本页不据此判断现有玻璃效果正确或缺陷。

## 关联

- [Wallpaper Accent OKLCH Contrast Solver](/concepts/wallpaper-accent-oklch-contrast-solver.md)：玻璃叠加后的文本对比度问题。
- [Web Animations API Runtime Architecture](/concepts/web-animations-api-runtime-architecture.md)：动画 `opacity` 会让元素在动画期间成为 backdrop root。
