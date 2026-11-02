---
type: concept
title: Pointer Capture and Drag Lifecycle in Searcher
domain: engineering
created: 2026-11-02
updated: 2026-11-02
sources:
  - sources/SRC-2026-11-02-001
---

# Pointer Capture and Drag Lifecycle in Searcher

## 平台语义

[`setPointerCapture(pointerId)`](/sources/SRC-2026-11-02-001.md)（[raw](../../raw/sources/SRC-2026-11-02-001/extracted.md) 第 193–198、228–231 行）把后续指针事件固定发往捕获元素，直到 `releasePointerCapture()` 或 `pointerup`；`pointerId` 不对应活动指针时抛 `NotFoundError`。官方示例同时设 `touch-action: none`（第 259 行）。

## Searcher 的用法（2026-11-02 检索 `web/src`）

四处调用 `setPointerCapture`，都在 `pointerdown` 里：

| 组件 | 释放与收尾 |
| --- | --- |
| `components/searcher/PaneResizeHandle.tsx` | 不显式释放；依赖 `pointerup` 的隐式释放。`onPointerUp` 与 `onLostPointerCapture` 都指向同一个 `finish`；`finish` 先核对 `pointerId` 再置空 `drag.current`，因此二次触发直接返回，保证 `onCommit` 只调用一次。`onPointerCancel` 回滚到拖拽前的值且**不** commit。只响应主键（`button !== 0` 返回） |
| `features/dock/WorkspaceDock.tsx`（悬浮球） | `pointerup` 里 `try { releasePointerCapture } catch {}`，注释为“捕获可能已丢失”；有独立的 `handleBallPointerCancel`；位移 > 5 px 才算拖拽，点击由 `click` 触发展开，注释说明原因是避免触屏兼容 click 落到下层元素 |
| `features/wallpaper/WallpaperCompositionDialog.tsx` | 同样 `try/catch` 包裹 `releasePointerCapture`，注释“pointer capture may already be lost” |
| `settings` 的壁纸预览容器 | CSS `touch-action: none; user-select: none`（`app/settings.css` 第 445–446 行） |

CSS 侧 `touch-action: none` 同时出现在 `pane-resize-handle.css`、`launcher.css`（可拖拽图标）、`window-frame.css`（标题栏与缩放把手）、`dock.css` 等，与 [Touch Action Gesture Ownership](/concepts/touch-action-gesture-ownership.md) 的结论一致：捕获解决“事件归谁”，`touch-action` 解决“浏览器是否抢走手势”，缺一不可（此处依据官方示例与项目实践，来源未单独论述原因）。

## 实践要点

- 收尾逻辑应幂等：`pointerup`、`pointercancel`、`lostpointercapture` 可能先后命中同一次拖拽，用 `pointerId` 与一个 ref 防重。`PaneResizeHandle` 是项目里的范例。
- 显式 `releasePointerCapture` 需要 `try/catch` 或先 `hasPointerCapture` 判断，因为捕获可能已被浏览器释放；项目选的是 `try/catch`。（来源仅说明无效 `pointerId` 会抛错，对“已释放后再调用是否抛错”未给结论，项目注释默认会抛。）
- `dnd-kit` 管理的拖拽（图标网格、笔记树）使用其自己的 sensor，本页的手写捕获只覆盖上表四处，不能推及 dnd-kit 内部实现。

## 未验证

- 未实测触屏上 `pointercancel` 的触发频率与 `lostpointercapture` 的先后顺序，上面“可能先后命中”是对规范事件模型的一般性推断。
- 窗口拖动（`WindowFrame`）是否使用捕获未在本次检索中出现（检索 `setPointerCapture` 无命中），其实现方式需要另读。

## 关联

- [Touch Action Gesture Ownership](/concepts/touch-action-gesture-ownership.md)
- [Overscroll Containment](/concepts/overscroll-containment-for-nested-scroll-areas.md)
- [dnd-kit 2D Grid Sorting Architecture](/concepts/dnd-kit-2d-grid-sorting-architecture.md)
- [Pointer Target Size](/concepts/pointer-target-size.md)
