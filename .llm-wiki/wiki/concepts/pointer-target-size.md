---
type: concept
title: Pointer Target Size
domain: accessibility
created: 2026-10-25
updated: 2026-10-25
sources: [sources/SRC-2026-10-25-004]
---

# Pointer Target Size（命中区）

## 标准

- WCAG 2.2 SC 2.5.8（AA）：pointer 目标 ≥ 24×24 CSS px，否则需满足 24px 圆不相交的间距例外，或 Equivalent / Inline / User agent control / Essential 例外（[[sources/SRC-2026-10-25-004]]）。
- 判定是"能否放下轴对齐的实心 24×24 正方形"；重叠区域只在执行同一动作时计入。

## Searcher 的取值

[[entities/searcher-项目]] 把命中区列为 `docs/design/VISUAL_LANGUAGE.md` 的**底线**（不可协商、只能加严），并采用比 AA 更严的 44px：

- 粗指针（`@media (any-pointer: coarse)`，`global.css` 中常与 `(hover: none)` 组合）下所有可操作目标 ≥ 44px；Token：`--control-touch-target` 44、`--row-min-height` 44（控件视觉高度仍是 `--control-height` 36 / `--control-compact-height` 28）。
- 仅 hover 出现的操作在触屏常显或收进 `⋯` 菜单。
- 具体落点（来自 `CHANGELOG.md` 与 `VISUAL_LANGUAGE.md`）：资料库分段控件触屏 44px（`a425607`）；统一输入框触屏选项 44px；强调色色点视觉 24px、命中区 ≥ 44px；应用图标移动端 44px；首页笔记任务复选框在粗指针下只于行首复选框列内上下扩展到 44px 高，相邻行重叠带按"离行中心最近"判定，不改变 22px 行距（`HomeNoteCard.tsx` 的 `onTaskPointerDown`）。
- 验证：部分 E2E（`apps-density`、`route-style-stability`），其余由 `UI_CHECKLIST.md` 实页逐项。

## 设计要点

- "扩大命中区而不扩大可见尺寸"是 2.5.8 本身建议的手段；Searcher 的任务复选框做法是其实例，并用最近中心规则消解重叠（对应 2.5.8 "重叠区域不计"的问题）。
- 精细指针不强制 44px：桌面密度保持不变，只在 `any-pointer: coarse` 时提升，避免桌面布局被触屏需求撑大。

## 关联

- [[concepts/aria-combobox-grouped-suggestions]]
- [[concepts/wallpaper-accent-oklch-contrast-solver]]
- [Touch Action Gesture Ownership](/concepts/touch-action-gesture-ownership.md)
