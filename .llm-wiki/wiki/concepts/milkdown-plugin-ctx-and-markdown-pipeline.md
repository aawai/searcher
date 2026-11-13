---
type: concept
title: Milkdown Plugin Ctx and Markdown Pipeline
domain: engineering
created: 2026-11-13
updated: 2026-11-13
sources:
  - sources/SRC-2026-11-13-005
  - sources/SRC-2026-11-13-006
  - sources/SRC-2026-11-13-007
  - sources/SRC-2026-11-13-008
---

# Milkdown Plugin Ctx and Markdown Pipeline

## 来源契约

1. **双向 Markdown 管线**（[Architecture Overview](/sources/SRC-2026-11-13-005.md)）：解析为 `Markdown → Remark AST → ProseMirror Schema → ProseMirror Document`；序列化为其逆序路径。`@milkdown/utils` 的 `$node` / `$mark` 在 ProseMirror `NodeSpec` / `MarkSpec` 之上扩展了 `parseMarkdown` 与 `toMarkdown` runner（[Composable Plugins](/sources/SRC-2026-11-13-007.md)）。
2. **Ctx / Slice / Timer 协调模型**（[Architecture Overview](/sources/SRC-2026-11-13-005.md)、[Plugins 101](/sources/SRC-2026-11-13-006.md)）：
   - `Ctx` 是单个编辑器实例共享的状态与依赖注入容器，由带唯一键的 `Slice<T>` 组成，支持 `inject`、`get`、`set`、`update`、`watch` 与 `remove`。
   - 原始 `MilkdownPlugin` 具有三层生命周期：**Prepare**（`.use()` 时执行 `ctx.record` / `ctx.inject`）→ **Run**（`.create()` 加载时 `await ctx.wait(...)`、读写 slice、`ctx.done(timer)`）→ **Post**（`.remove()` 或 `editor.destroy()` 时 `ctx.clearTimer` / `ctx.remove`）。
   - 插件可通过向内置 timer slice（如 `editorStateTimerCtx`）追加自定义 `Timer`，延迟编辑器状态初始化直到前置异步准备完成。
3. **插件组合与重建**（[Composable Plugins](/sources/SRC-2026-11-13-007.md)、[Using Plugins](/sources/SRC-2026-11-13-008.md)）：`$command`、`$inputRule`、`$useKeymap` 支持跨插件调用（如经 `commandsCtx.call(...)` 执行命令）；运行期增删插件或配置后需重新 `await editor.create()` 生效。

## Searcher 实现（2026-11-13 读码）

代码位于 `web/src/features/markdown-editor/`：

- **装配与配置**（`runtime.ts` 第 207–248 行）：`Editor.make().config(...)` 设置 `rootCtx`、`defaultValueCtx` 与 `remarkStringifyOptionsCtx`（`bullet: "-", rule: "-"`），随后 `.use(commonmark).use(gfm).use(history).use(remarkImageSanitizer).use(originController.plugin).use(domEvents)`，按需追加 `softBreakPresentation` 与 consumer 自定义插件。
- **Remark AST 规范化扩展**（`extensions/remark-image.ts` 第 9–28 行）：使用 `$remark("remarkImageSanitizer", ...)` 在 Remark → ProseMirror 转换前把 mdast image 节点的 `title: null` 转为 `undefined`，避免 ProseMirror 属性校验失败，并原样保留 `asset://...` 与 HTTP URL。
- **ProseMirror 原生插件注入**（`runtime.ts` 第 78–178 行、`extensions/task-list.ts` 第 6–54 行）：通过 `$prose((ctx) => new Plugin(...))` 注入三类插件：`createChangeOriginPlugin` 在 state `apply` 读取 `ctx.get(serializerCtx)` 序列化变更；`createDomEventsPlugin` 桥接 focus/blur/composition 与 Ctrl/Cmd+B/I 选区同步；`taskListControls` 为 `list_item` 提供可点击且隔离编辑器事件的 checkbox `NodeView`。
- **命令与状态同步**（`commands.ts` 第 1–63 行）：`executeCommand(ctx, ...)` 复用 `ctx.get(commandsCtx)` 调用 CommonMark/GFM 内置命令（如 `toggleStrongCommand`、`insertTableCommand`），并配合 `ctx.get(editorViewCtx)` 与 `ctx.get(schemaCtx)` 执行自定义 ProseMirror 命令。
- **挂载与销毁竞态保护**（`runtime.ts` 第 230–282 行）：若 `create()` 抛错且 `editor.status === EditorStatus.Created` 会主动 `destroy()`；`create()` 完成后通过 `await Promise.resolve()` 排空初始化微任务再 `originController.enable()`，防止首帧规范化 transaction 回流为 `user` 编辑。

## 差异与注意事项

- 仅阅读了 Milkdown 文档与 `runtime.ts` / `commands.ts` / `extensions/`；未在本次运行测试或浏览器验证。
- Milkdown 7.22.2（Searcher 当前锁定版本）使用独立包名 `@milkdown/core`、`@milkdown/utils`，而当前官方文档已将统一入口写作 `@milkdown/kit/*`；API 概念一致但导入路径随版本差异而不同。
- 撤销栈与 programmatic transaction 来源细节见 [ProseMirror Transaction Origin and Undo History](/concepts/prosemirror-transaction-origin-and-undo-history.md)。

## 关联

- 实体：[Milkdown Editor](/entities/milkdown-editor.md)
- 实体：[Searcher 项目](/entities/searcher-项目.md)
- 概念：[ProseMirror Transaction Origin and Undo History](/concepts/prosemirror-transaction-origin-and-undo-history.md)
- 概念：[Offline-first 与 Local Draft 持久化架构](/concepts/offline-first-与-local-draft-持久化架构.md)
