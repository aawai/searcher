---
type: concept
title: Modal Dialog Focus and Semantics
domain: engineering
created: 2026-10-29
updated: 2026-10-29
sources:
  - sources/SRC-2026-10-29-002
---

# Modal Dialog Focus and Semantics

[W3C APG 模态对话框模式](/sources/SRC-2026-10-29-002.md)（[原始提取](../../raw/sources/SRC-2026-10-29-002/extracted.md)，第 28–37、49–108 行）描述模态层的焦点、键盘和辅助技术语义；它是设计模式，不证明项目中的任一对话框已经符合要求。

## 焦点与关闭

- 打开时将焦点移入对话框；Tab 与 Shift+Tab 在内部循环，Escape 关闭当前对话框。关闭后一般返回触发元素；触发元素已不存在或完成任务后另一个位置更符合工作流时，应选择合理替代焦点。
- 初始焦点取决于内容与任务：长内容或带结构的内容可聚焦顶部带 `tabindex="-1"` 的静态元素，避免跳过内容；难以撤销的操作可考虑默认聚焦较不具破坏性的动作。建议提供可见的关闭或取消按钮。

## 语义与真实模态性

对话框容器具有 `dialog` 角色、可访问名称和 `aria-modal="true"`，操作对话框所需元素位于其内部。复杂结构化内容不宜机械地将整个内容作为 `aria-describedby`，以免屏幕阅读器将其作为无法按结构浏览的长描述。只有在应用确实阻止所有用户与外部内容交互、且视觉上遮蔽外部内容时，才应声明模态；ARIA 标记本身不会实现这些行为。

## 关联

- [Modal Layering and Escape Dismissal](/concepts/modal-layering-and-escape-dismissal.md)：多层与子视图的关闭优先级。
- [shadcn UI System](/entities/shadcn-ui-system.md)：项目采用的组件体系。
- [W3C APG 来源](/sources/SRC-2026-10-29-002.md)。
