---
type: concept
title: Accessible Grid Drag — Keyboard and Announcements
domain: accessibility
created: 2026-10-25
updated: 2026-10-25
sources: [sources/SRC-2026-10-25-005]
---

# Accessible Grid Drag：键盘移动与屏幕阅读器播报

可访问的拖放需要三件事（[[sources/SRC-2026-10-25-005]]）：可聚焦且有等价键盘操作、聚焦时的操作说明、拖动过程中的 live region 播报。[[entities/dnd-kit-system]] 默认提供英文版本；[[entities/searcher-项目]] 有两种接法。

## 两种实现模式

| | 首页应用网格 `WebAppLauncher.tsx` | 首页笔记 `HomeNotes.tsx` |
|---|---|---|
| Sensor | `PointerSensor`（distance 8）+ `KeyboardSensor` | 仅 `PointerSensor`（distance 4） |
| 键盘步进 | `sortableKeyboardCoordinates`：跳到方向上的下一个可排序项 | 卡片 `onKeyDown`：`KEY_MOVES` 按网格单元 ±1；冲突时 `resolveHomeNoteCell` 找最近空闲单元，无空位播报"这个方向没有空闲位置" |
| 确认 / 取消 | 库默认（Space/Enter、Escape） | Enter/Space 提交 `PATCH` 布局，Escape 只清除预览 |
| 说明 | 库默认（英文） | `aria-roledescription="可移动的首页笔记"` + `aria-label` 含尺寸、单元位置与"方向键移动，Enter 确认，Escape 取消" |
| 播报 | 库默认（英文） | 自有 `role="status" aria-live="polite" aria-atomic` 区域，中文、用标题与单元位置描述 |

选择自定义键盘的理由（[INFERENCE] 由实现推断）：笔记是 S(1×1)/W(2×1) 混合尺寸的吸附网格，"下一个单元"取决于占用与障碍物（搜索框、应用底板），不是"下一个兄弟元素"，`KeyboardSensor` 的像素步进或 sortable 坐标都不匹配；且需要"预览 → 确认"两阶段，确认前不写服务器。

## 实现细节

- 重复播报同一句时追加空格（`previous === message ? message + " " : message`），强制 live region 再次读出。
- 拖动手柄 `tabIndex={-1}`：键盘焦点只落在卡片本身，避免同一对象两个 Tab 停靠点。
- 键盘事件仅在 `event.target === event.currentTarget` 时处理，卡片内按钮 / 复选框的方向键不被劫持。

## 已知风险

- 两处 `DndContext` 都没有传 `accessibility`（`announcements` / `screenReaderInstructions`）。核对 `@dnd-kit/core@6.3.1` 源码：库总会渲染默认英文说明与 live region，默认播报形如 `"Picked up draggable item " + active.id`。首页笔记的 `active.id` 是笔记 UUID。[INFERENCE] 指针拖动笔记或应用时，屏幕阅读器可能读出英文 + UUID，与中文自定义播报叠加；未实测。修正方向：向 `DndContext` 传本地化的 `accessibility.announcements` / `screenReaderInstructions`，或在已自建播报处让库播报返回空。
- 播报应使用 1 起的位置（"第 2 行第 3 列"）而非 0 起的 index。

## 关联

- [[concepts/dnd-kit-2d-grid-sorting-architecture]]
- [[concepts/modal-layering-and-escape-dismissal]]
- [[concepts/pointer-target-size]]
