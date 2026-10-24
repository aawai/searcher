---
type: concept
title: ARIA Combobox Grouped Suggestions
domain: accessibility
created: 2026-10-24
updated: 2026-10-24
sources: [sources/SRC-2026-10-24-010]
---

# ARIA Combobox Grouped Suggestions (统一输入框的可访问性契约)

[[entities/searcher-项目]] 首页统一输入框是 APG 定义的 **editable combobox + listbox popup，list autocomplete with manual selection**：输入任意值，建议仅作参考，未选中建议时输入串即为值。

## 角色与属性

- 输入框：`role="combobox"`、`aria-autocomplete="list"`、`aria-expanded`；`aria-controls` 与 `aria-activedescendant` 仅在弹层打开时设置。
- 弹层：`role="listbox"` + `aria-label`；分组（问 AI / 我的 / 应用 / 网页 / 命令）为带名称的 `role="group"`。
- DOM 焦点始终在输入框；活动项通过 `aria-activedescendant` 指向一条**扁平**的 option 序列，分组仅是语义包裹（`OmniboxListbox`）。
- 结果数量由状态区播报；触屏选项保持 44px。

## 键盘契约

| 按键 | APG 要求 | Searcher 取值 |
|---|---|---|
| `Down`/`Up` | 进入/移动弹层选择 | 同 |
| `Enter` | 接受选中建议 | 未选中时用默认引擎搜索，不把命令名当命令执行 |
| `Escape` | 关闭弹层，可选清空 | 逐层关闭：建议 → 菜单/弹窗 → 回答卡片 |
| 文本编辑键 | 禁止拦截 | 只占用 `Enter`、`Alt+Enter`、`Shift+Enter`、`Escape`；IME 合成期间全部不响应 |

## 异步建议的边界

- 个人检索带防抖并中止过期请求；401 时个人分组立即消失，在线联想失败只降级"网页"分组。
- 已关闭的弹层不得被迟到的异步结果重新打开（历史缺陷见 [[sources/obs-2026-10-15-searchersearchinput-unguided-async-suggestions-reopening-bug]]）。

## 关联

- [[sources/SRC-2026-10-24-010]]
- [[concepts/modal-layering-and-escape-dismissal]]
- [[entities/shadcn-ui-system]]
