---
type: concept
title: Scrollbar Gutter and Width-Driven Layout Stability
domain: engineering
created: 2026-11-01
updated: 2026-11-01
sources:
  - sources/SRC-2026-11-01-001
---

# Scrollbar Gutter and Width-Driven Layout Stability

[MDN](/sources/SRC-2026-11-01-001.md)（[raw](../../raw/sources/SRC-2026-11-01-001/extracted.md) 第 193–241 行）：经典滚动条占用槽，所以滚动条出现/消失会改变内容盒宽度；覆盖式滚动条不占槽，`scrollbar-gutter` 对其无效（第 320 行）。

| 值 | 经典滚动条 | 覆盖式滚动条 |
| --- | --- | --- |
| `auto` | `overflow: scroll`，或 `auto` 且溢出时才有槽 | 无槽 |
| `stable` | `auto`/`scroll`/`hidden` 都常驻槽，与是否溢出无关 | 无槽 |
| `stable both-edges` | 另一侧同样预留，内容居中对称 | 无槽 |

核心用途：**当内容宽度会反过来影响内容高度（或缩放比）时，切断“滚动条出现 → 宽度变化 → 重排 → 溢出状态变化 → 滚动条消失”的循环**。`stable` 让可用宽度与是否溢出脱钩。

## Searcher 的实际用法（2026-11-01 读取 `web/src`）

唯一一处：`features/documents/document-pagination.css` 第 50–56 行，选择器为含 `.pagination-viewport[data-mode="page"][data-scroll-owner="outer"]` 的 `.document-editor-scroll-area`，注释写明目的是“让随宽度缩放的纸张比例不受竖向滚动条可见性影响”。

历史依据：[Observation: Issue 158 Zen page scrollbar feedback loop](/sources/obs-2026-10-11-issue-158-zen-page-scrollbar-feedback-loop.md) 记录了在经典滚动条 Chromium 中复现的空闲抖动（2 秒内 120 次重排，可用宽度 851↔866px、缩放 1↔0.991558），仅给该滚动区加 `scrollbar-gutter: stable` 后空闲重排为 0、纸张几何恒定。该记录是当时的实测，本页未重新运行。

## 与全局滚动条样式的关系

`styles/global.css` 第 15–52 行对精确指针设备用 `::-webkit-scrollbar`（宽 `--scrollbar-size`，滑块默认透明，滚动中由 `data-scrolling` 显示，见 `design-system/scroll-activity.ts`）；不支持该伪元素的浏览器改用 `scrollbar-width: thin` 与 `scrollbar-color`。

[INFERENCE] 用 `::-webkit-scrollbar` 设定了尺寸的滚动条仍然是经典滚动条，会占用 `--scrollbar-size` 宽度，即使滑块透明；MDN 来源并未讨论此点，需要在 Chromium 中实测滚动区宽度才能确认。如果成立，意味着其他随溢出状态改变可用宽度的滚动区（不止分页纸张）同样会有这种反馈风险，但目前只有分页视图的宽度会反馈到缩放，本页未发现其他已知案例。

触屏设备保留原生覆盖式滚动条（`global.css` 注释），`scrollbar-gutter` 在那里天然无效，因此该修复只影响桌面经典滚动条环境；E2E 复现须使用 `ignoreDefaultArgs --hide-scrollbars` 之类让 Chromium 显示经典滚动条的启动参数（来自 Issue 158 记录）。

## 关联

- [Overscroll Containment for Nested Scroll Areas](/concepts/overscroll-containment-for-nested-scroll-areas.md)：同属滚动容器行为声明，一个管边界后的链出，一个管槽的预留。
- [CSS Container Queries](/concepts/css-container-queries.md)：宽度驱动的布局若依赖容器内容盒宽度，需同时考虑槽。
- [Searcher 项目](/entities/searcher-项目.md)
