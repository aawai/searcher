---
type: entity
title: assistant-ui Framework
category: tool
created: 2026-11-14
updated: 2026-11-14
sources:
  - sources/SRC-2026-11-14-001
  - sources/SRC-2026-11-14-002
  - sources/SRC-2026-11-14-003
  - sources/SRC-2026-11-14-004
  - sources/SRC-2026-11-14-005
  - sources/SRC-2026-11-14-006
---

# assistant-ui Framework

**assistant-ui** 是面向 React（及 Vue / React Native / Ink）AI 对话界面的无头组件原语与运行时状态框架。在 [[entities/searcher-项目]] 中，前端 Ask 对话工作台基于 `deno.jsonc` 引入的 `@assistant-ui/react@0.15.2` 与 `@assistant-ui/core@0.3.21/internal` 构建（另声明 `assistant-cloud@0.2.3`，当前未在 Ask 业务路径直接使用）。

## 核心架构分层

- **Runtime 层（External Store 模式）**：通过 `useExternalStoreRuntime` 与 `AssistantRuntimeProvider` 将应用自有状态与服务端流式同步桥接到 UI 原语，按传入回调动态开启编辑、重生成、取消与分支切换能力（[SRC-2026-11-14-001](/sources/SRC-2026-11-14-001.md)、[SRC-2026-11-14-003](/sources/SRC-2026-11-14-003.md)）。
- **Branchable Message Repository**：`ExportedMessageRepository` 与底层 `MessageRepository` 维护基于 `parentId` 的对话树与 `headId` 游标，支持消息编辑和多次重新生成形成的兄弟分支（[SRC-2026-11-14-001](/sources/SRC-2026-11-14-001.md)、[SRC-2026-11-14-006](/sources/SRC-2026-11-14-006.md)）。
- **Scoped Context API**：`useAuiState`、`useAui` 与 `useAuiEvent` 依据组件渲染树位置解析 `thread`、`message`、`composer`、`attachment` 等作用域，隔离状态订阅、命令触发与事件监听（[SRC-2026-11-14-004](/sources/SRC-2026-11-14-004.md)）。
- **UI Primitives & Adapters**：无样式原语（`ThreadPrimitive`、`MessagePrimitive`、`ComposerPrimitive`、`ActionBarPrimitive`、`BranchPickerPrimitive`、`AttachmentPrimitive`）结合 `AttachmentAdapter` 等扩展点承载具体界面与文件输入管线（[SRC-2026-11-14-005](/sources/SRC-2026-11-14-005.md)）。

## Searcher 中的落点边界（2026-11-14 读码）

- **运行时组装**：`web/src/features/ask/assistant-runtime.tsx`（`SearcherAssistantRuntimeProvider`）将后端 `AiMessageDto[]` 经 `convertAiMessageToThreadMessageLike` 转换并构造 `ExportedMessageRepository.fromBranchableArray(items, { headId: activeLeafMessageId ?? null })`，接入 `useExternalStoreRuntime`、`setMessages`（联动 `onBranchChange`）、`onNew`、`onEdit`、`onReload`、`onCancel` 与 `adapters.attachments`。
- **消息适配契约**：`web/src/features/ask/assistant-message-adapter.ts` 与单元测试 `assistant-message-adapter.test.ts` 验证：数据库持久化中 `user` / `system` 消息虽带 `status="complete"`，但传给 `ThreadMessageLike` 时必须省略 `status`，否则 `ExportedMessageRepository.fromBranchableArray` / `MessageRepository.import` 会抛出 `"status is only supported for assistant messages"`。
- **附件与草稿同步**：`web/src/features/ask/SearcherAttachmentAdapter.ts` 实现 `AttachmentAdapter`，按当前选中模型 `supportsVision` 动态收窄 `accept`；发送失败时 `assistant-runtime.tsx` 显式把文本与附件回填到 `runtime.thread.composer`。
- **UI 原语装配**：`SearcherThread.tsx`、`SearcherUserMessage.tsx`、`SearcherAssistantMessage.tsx` 与 `SearcherComposer.tsx` 组合原语与 [[entities/shadcn-ui-system]]（Base UI `Button`/`Popover`/`Tooltip`），并通过 `useAuiState((s) => s.message?.metadata?.custom?.rawMessage)` 读取扩展元数据（工具调用、来源、Token 统计）。

## 关联

- 概念：[ExternalStoreRuntime and Branchable Message Repository](/concepts/externalstoreruntime-and-branchable-message-repository.md)
- 概念：[Assistant UI Scoped Context and Attachment Adapter](/concepts/assistant-ui-scoped-context-and-attachment-adapter.md)
- 概念：[OpenAI-Compatible Streaming and Tool Calls](/concepts/openai-compatible-streaming-and-tool-calls.md)
- 概念：[Server-Sent Events 与实时事件流](/concepts/server-sent-events-sse-与实时事件流.md)
- 实体：[React 19 Framework](/entities/react-19-framework.md)、[Searcher 项目](/entities/searcher-项目.md)
