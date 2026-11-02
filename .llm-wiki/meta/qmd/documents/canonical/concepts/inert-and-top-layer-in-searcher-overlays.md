---
type: concept
title: Inert and Top Layer in Searcher Overlays
domain: engineering
created: 2026-11-01
updated: 2026-11-01
sources:
  - sources/SRC-2026-11-01-004
  - sources/SRC-2026-11-01-005
---

# Inert and Top Layer in Searcher Overlays

## 平台语义

[`inert`](/sources/SRC-2026-11-01-004.md)（[raw](../../raw/sources/SRC-2026-11-01-004/extracted.md) 第 198–212 行）一次性做到：不可点击、不可聚焦、移出 Tab 顺序与无障碍树、不可查找/选中/编辑。唯一逃脱者是 `showModal()` 打开的模态 `<dialog>`（第 200 行）。它没有视觉标识，开发者必须自己区分（第 229 行）。单个控件应用 `disabled`。

[Popover API](/sources/SRC-2026-11-01-005.md)（[raw](../../raw/sources/SRC-2026-11-01-005/extracted.md) 第 214–217、291–295 行）始终**非模态**，`showPopover()` 把元素放进 top layer；模态需求用 `<dialog>`。

## Searcher 的实际用法（2026-11-01 读取 `web/src`）

**没有使用原生 `<dialog>`、`popover` 属性、`popovertarget`、`showPopover`**（检索无结果）。弹层来自 Base UI（`components/ui/popover.tsx` 封装 `@base-ui/react/popover`），层级用 `--elevation-*` 令牌（`design-system/tokens.css` 第 103–107 行）而不是 top layer。因此：

- 原生 top layer 的“自动盖在所有 `z-index` 之上”不适用；叠放靠令牌与 portal，Escape 的优先级靠 `components/ui/escape-layer-stack.tsx`（见 [Modal Layering and Escape Dismissal](/concepts/modal-layering-and-escape-dismissal.md)）。
- 项目对 `inert` 的用法共分三类（检索 `inert` 约 20 处命中，下列为代表）：

| 用途 | 位置 | 机制 |
| --- | --- | --- |
| 退场动画期间禁止交互 | `components/searcher/semantic.tsx`、`SearcherSearchInput.tsx`、`features/dock/WorkspaceDock.tsx`、`features/inline-ai/InlineAnswerCard.tsx` | 关闭时保留节点，设 `inert` 与 `data-ending-style`，CSS 退场结束后卸载（`semantic.tsx` 第 169–170 行注释；`presence.ts` 第 6 行） |
| 窗口内模态遮罩 | `components/ui/window-overlay.tsx` 第 42–67 行 | 打开时把遮罩的**兄弟元素**逐个设 `inert=true`，关闭时恢复到原值；并自带 Tab 循环、Escape 层与焦点恢复 |
| 被裁剪的控件 | `features/home-layouts/HomeNoteCard.tsx` 第 198 行 | 位置落在预览区之外的控件设 `inert`，避免不可见控件被 Tab 到 |

- `WindowFrame.tsx` 第 366–367 行注释明确“**不活跃窗口仍可被指针交互，所以不能用 inert**”，后台窗口改用自管 Tab 逻辑（`tabStopOutside` 跳过 `[inert]` 与非活动窗口）。这说明 `inert` 的“也禁指针”语义在该场景不合适，是项目有意的取舍。
- `WorkspaceDock.tsx` 第 789–792 行注释：点击展开时若立即让悬浮球 inert，触屏的兼容性 click 会落到下方元素（例如首页便签），所以展开推迟到 click 之后。这是 `inert` 与触屏事件序列相互作用的实例。

## 注意点

- `window-overlay.tsx` 的兄弟元素 inert 方案与模态 `<dialog>` 不同：没有 top layer，只在该 overlay 的父容器内生效，所以作用域是窗口而不是整页；覆盖范围依赖 DOM 结构，新加的兄弟节点在 effect 运行之后挂载时**不会**被追加设为 inert（代码在 effect 里一次性取快照，未用 MutationObserver；未实测）。
- `inert` 同时移出无障碍树。`aria-hidden` 与 `inert` 的叠用见 `WorkspaceDock.tsx` 第 910–911 行（模态激活时 `aria-hidden`，退场时 `inert`），含义不同，不应互相替代。
- 若将来想采用原生 Popover API，来源只证明它非模态、进 top layer 且需要自己处理焦点/Escape 之外的语义；与 Base UI 的定位、动画状态（`data-starting-style`/`data-ending-style`）如何衔接，本页没有证据。

## 关联

- [Modal Dialog Focus and Semantics](/concepts/modal-dialog-focus-and-semantics.md)
- [Modal Layering and Escape Dismissal](/concepts/modal-layering-and-escape-dismissal.md)
- [Touch Action Gesture Ownership](/concepts/touch-action-gesture-ownership.md)
- [Playwright Actionability and E2E Wait Conditions](/concepts/playwright-actionability-and-e2e-waits.md)
