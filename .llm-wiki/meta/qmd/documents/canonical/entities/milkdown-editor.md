---
type: entity
title: Milkdown Editor
category: tool
created: 2026-11-13
updated: 2026-11-13
sources:
  - sources/SRC-2026-11-13-005
  - sources/SRC-2026-11-13-006
  - sources/SRC-2026-11-13-007
  - sources/SRC-2026-11-13-008
---

# Milkdown Editor

**Milkdown** 是基于 ProseMirror 与 Remark 的插件驱动所见即所得（WYSIWYG）Markdown 编辑器框架，在 [[entities/searcher-项目]] 中作为笔记编辑器的共享运行时内核（`deno.jsonc` 使用 `@milkdown/core`、`@milkdown/ctx`、`@milkdown/utils`、`@milkdown/preset-commonmark`、`@milkdown/preset-gfm`、`@milkdown/plugin-history`、`@milkdown/prose` 7.22.2）。

## 核心分层

- **Core 层**：提供 `Editor` 构建/生命周期管理、`Ctx` 依赖注入容器与基础文档模型接口（[Architecture Overview](/sources/SRC-2026-11-13-005.md)）。
- **Plugin 层**：语法预设（`commonmark`、`gfm`）与功能插件（`history`、`listener`、`clipboard` 等）均作为 `MilkdownPlugin` 装配（[Using Plugins](/sources/SRC-2026-11-13-008.md)）。
- **Component / Editor 层**：无头组件与开箱编辑器（如 Crepe），Searcher 选择不加载框架主题，仅在 `web/src/features/markdown-editor/` 组装 Core + Preset + 自建 ProseMirror/Remark 插件。

## Searcher 中的边界

- 共享编辑器适配器由 `web/src/features/markdown-editor/runtime.ts` 与 `commands.ts` 拥有，通过 `Editor.make().config(...).use(...).create()` 挂载受控实例，并通过 `editor.action(ctx => ...)` 访问 `editorViewCtx`、`parserCtx`、`serializerCtx`、`commandsCtx` 与 `schemaCtx`。
- 业务契约见 `docs/editor/MARKDOWN_EDITOR.md`：只读列表与首页刊头不实例化 Milkdown；编辑器通过 `route-level` 动态加载并受 `check:bundle` 字节预算限制。

## 关联

- 概念：[Milkdown Plugin Ctx and Markdown Pipeline](/concepts/milkdown-plugin-ctx-and-markdown-pipeline.md)
- 概念：[ProseMirror Transaction Origin and Undo History](/concepts/prosemirror-transaction-origin-and-undo-history.md)
- 概念：[Route-Level Code Splitting & Dynamic Bundling](/concepts/route-level-code-splitting-dynamic-bundling.md)
- 实体：[Searcher 项目](/entities/searcher-项目.md)
