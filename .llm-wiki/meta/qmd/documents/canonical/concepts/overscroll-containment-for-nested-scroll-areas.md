---
type: concept
title: Overscroll Containment for Nested Scroll Areas
domain: engineering
created: 2026-10-31
updated: 2026-10-31
sources:
  - sources/SRC-2026-10-31-005
---

# Overscroll Containment for Nested Scroll Areas

[MDN](/sources/SRC-2026-10-31-005.md)（[raw](../../raw/sources/SRC-2026-10-31-005/extracted.md) 第 322–342 行）把边界行为分成两个独立维度：**是否链到外层滚动**与**是否出现回弹/下拉刷新**。

| 值 | 链出外层 | 回弹 |
| --- | --- | --- |
| `auto` | 是 | 是 |
| `chain` | 是 | 否 |
| `contain` | 否 | 可能保留 |
| `none` | 否 | 否 |

要点：只对滚动容器生效；`overflow: hidden` 容器始终处于边界，所以给它设 `contain`/`none` 可阻止背景滚动，用于对话框与浮层；`<iframe>` 要在内部文档的 `html` 与 `body` 上都设置。MDN 标注该属性为 Limited availability，不是 Baseline，因此它只能当渐进增强，不能是唯一的滚动隔离手段。

## Searcher 当前使用（2026-10-31 读取 `web/src`）

`overscroll-behavior: contain` 出现在：

- `features/workspace/workspace.css` 第 14 行 `.workspace-body`：工作区窗口内容区。
- `features/library/library-apps.css` 第 25 行 `.library-apps-scroll`：应用库滚动区。
- `components/searcher/launcher.css` 第 600 行 `.launcher-popup-body`：启动器文件夹弹窗内容。
- `features/documents/document-editor.css` 第 277 行 `overscroll-behavior-x: contain`：窄屏文档工具栏横向滚动，避免横滑链到页面。

`web/src/styles` 与 `web/index.html` 没有为 `html`/`body` 设置 `overscroll-behavior`，所以页面根部的下拉刷新/回弹行为保持浏览器默认；这是检索结果，是否在 PWA 独立窗口中造成问题未验证（[PWA 更新生命周期](/concepts/pwa-service-worker-update-lifecycle.md) 不涉及此项）。

模态对话框的背景滚动是否另有 JS 锁滚或仅依赖该属性，未核查；对话框由 Base UI 提供，行为见 [Modal Layering and Escape Dismissal](/concepts/modal-layering-and-escape-dismissal.md)。

## 关联

- [Touch Action Gesture Ownership](/concepts/touch-action-gesture-ownership.md)：两者都是“手势/滚动归谁”的边界声明，一个管起手手势，一个管到边之后。
- [Modal Dialog Focus and Semantics](/concepts/modal-dialog-focus-and-semantics.md)
