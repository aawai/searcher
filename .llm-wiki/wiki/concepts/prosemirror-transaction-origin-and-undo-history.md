---
type: concept
domain: engineering
title: ProseMirror Transaction Origin and Undo History
created: 2026-11-08
updated: 2026-11-08
sources:
  - sources/SRC-2026-11-08-007
---

# ProseMirror Transaction Origin and Undo History

## 来源契约

[ProseMirror Guide](/sources/SRC-2026-11-08-007.md)：所有修改都以 transaction 进入，并在一次 `state.apply` 中计算出新 state。plugin state 的 `apply` 只能返回新值，不能修改其他状态。transaction metadata 用来标记 transaction 的来源，内置键 `"addToHistory": false` 让该 transaction 不进入撤销栈。需要观察所有 transaction 时，接入点是 `dispatchTransaction`。

## Searcher 实现（2026-11-08 读码）

契约文档：[docs/editor/MARKDOWN_EDITOR.md](../../../docs/editor/MARKDOWN_EDITOR.md)。运行时：`web/src/features/markdown-editor/runtime.ts`。

- **来源判定**：`originMetaKey`（PluginKey）区分 `user` / `initialization` / `programmatic` / `normalization`。对 `appendedTransaction`（如 GFM fixTables）会沿父链继承来源；没有任何标记的 transaction 一律视为 `user`。
- **onChange 的位置**：变更通知写在一个插件的 state `apply` 中。该插件的 state 恒为 `null`，每次 `docChanged` 都会序列化整篇文档并调用 `onChange`。来源要求 plugin state 的 apply 是纯计算，副作用放在这里不符合这一模型；不过只要 state 只随 dispatch 计算一次，就不会造成重复通知。
- **`replaceMarkdown`**：用整篇替换的 transaction 并标记 `programmatic`，但**没有**设置 `addToHistory: false`。项目里其他程序化 transaction（`documents/document-pagination.ts`、`documents/editor-extensions.ts`）都设置了该键。
- 唯一的业务调用点是 `DocumentEditor.tsx` 第 1008–1017 行：snapshot 正文变化后（如应用草稿、恢复历史、从 Source 切回）同步进编辑器。

## 已验证的行为

2026-11-08 用 happy-dom 写了临时测试，沿用 `runtime.test.ts` 的环境搭建方式（测试文件已删除）：

1. 以“本地正文”创建编辑器，调用 `replaceMarkdown("云端正文")`，onChange 来源为 `programmatic`。
2. 调用 `undo()` 返回 `true`，文档变回“本地正文”，onChange 来源为 **`user`**。

即：程序化替换会进入撤销栈，撤销它产生的 transaction 会被判为用户编辑。原因是 history 插件生成的 undo transaction 不带 `originMetaKey`。

## 影响（未验证）

在真实 UI 中，冲突接受云端版本或恢复历史之后按 Ctrl/Cmd+Z，可能把旧正文作为一次 dirty 用户编辑提交，进而进入 autosave。这一点**没有**经过实页或 E2E 验证。`initKey` 只在“重试加载”时递增（第 1402 行）。编辑器的挂载 effect 还依赖 `session`、`richMode`、`needsPagination` 等；在上述路径中编辑实例是否会重建、撤销栈是否因此清空，均未追踪。docs/editor 中“undo/redo”与“409 云端替换”是分别覆盖的验证项。“撤销是否应跨越程序化替换”是未声明的契约，需人类决定；在此之前不能把它记为已确认缺陷。

## 关联

- [Offline-first 与 Local Draft 持久化架构](/concepts/offline-first-与-local-draft-持久化架构.md)
- [Markdown Sanitization with rehype-sanitize](/concepts/markdown-sanitization-with-rehype-sanitize.md)
- [Route-Level Code Splitting](/concepts/route-level-code-splitting-dynamic-bundling.md)
- [Searcher 项目](/entities/searcher-项目.md)
