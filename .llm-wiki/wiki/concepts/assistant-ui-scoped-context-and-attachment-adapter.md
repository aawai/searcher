---
type: concept
domain: engineering
title: Assistant UI Scoped Context and Attachment Adapter
created: 2026-11-14
updated: 2026-11-14
sources:
  - sources/SRC-2026-11-14-003
  - sources/SRC-2026-11-14-004
  - sources/SRC-2026-11-14-005
---

# Assistant UI Scoped Context and Attachment Adapter

本概念整合 [[entities/assistant-ui-framework]] 中两部分紧耦合的前端工程边界：一是以渲染位置解析作用域的 **Context API**（`useAuiState` / `useAui` / `useAuiEvent`），二是管理文件校验、编码与发送回滚的 **`AttachmentAdapter`** 生命周期契约。

## Scoped Context API 契约（[SRC-2026-11-14-004](/sources/SRC-2026-11-14-004.md)）

- **分层作用域**：组件在树中所处位置决定可访问作用域（`threads` → `thread` → `message` / `composer` → `part` / `attachment`），子作用域可读父作用域状态；当组件可能渲染在缺失某作用域的位置时，须使用 `s.optional.<scope>` 读取以免抛错。
- **三个 Hook 的职责分离**：
  - `useAuiState(selector)`：订阅精细切片；选择器**禁止每次构造新对象或新数组字面量**，否则触发无限重渲染。
  - `useAui()`：获取无订阅的命令客户端，用于事件处理与 `getState()`；结构变更（如切换对话）会生成新客户端，因此不应把 `aui.thread` 等子句柄跨渲染长期缓存。
  - `useAuiEvent(event, handler)`：监听瞬时过渡事件（如 `composer.send`、`composer.attachmentAddError`、`composer.textChange`）。

## AttachmentAdapter 生命周期契约（[SRC-2026-11-14-003](/sources/SRC-2026-11-14-003.md)、[SRC-2026-11-14-005](/sources/SRC-2026-11-14-005.md)）

- **接口四要素**：`accept`（MIME/扩展名白名单）、`add({ file })`（返回 `PendingAttachment` 或同 `id` 进度 async generator）、`send(attachment, { signal })`（发送前转换为 `CompleteAttachment`，支持 `AbortSignal` 中止）、`remove(attachment)`（清理计数或对象 URL）。
- **错误与回滚语义**：
  - `addAttachment()` 遇到无适配器（`no-adapter`）、类型不匹配 `accept`（`not-accepted`）或适配器抛错/返回 `status.reason === "error"`（`adapter-error`）时，都会触发 `composer.attachmentAddError` 事件。
  - 若消息发送失败或中途取消，composer 会收回文本与附件，并把失败附件标为 `status: { type: "incomplete", reason: "error" }`。

## Searcher 实现边界（2026-11-14 读码）

- **作用域读取与元数据提取**：
  - `SearcherUserMessage.tsx` 与 `SearcherAssistantMessage.tsx` 通过 `useAuiState` 分别读取 `s.message.composer.isEditing`、`s.message.isCopied`、`s.message?.metadata?.custom?.rawMessage` 等基础属性或稳定对象引用，避免在 selector 内直接组装新对象。
  - `SearcherComposer.tsx` 在文件拖放 `handleDrop` 中调用 `useAui().composer.addAttachment(file)`，并在 `ComposerAttachmentChip` 内读取 `s.attachment.content` 与 `s.attachment.status`。
- **草稿双向同步与 `AttachmentAdapter` 包装**（`web/src/features/ask/assistant-runtime.tsx`、`SearcherAttachmentAdapter.ts`）：
  - `SearcherAssistantRuntimeProvider` 维护一个 `useMemo` 创建的 `SearcherAttachmentAdapter` 实例，每次渲染通过 `attachmentAdapter.updateState(supportsVision)` 动态更新 `accept`（不支持视觉的模型剔除 `image/png,image/jpeg,image/webp`）。
  - `SearcherAttachmentAdapter.add()` 先调用 `validateAttachmentFile` 校验数量上限、类型与大小，不通过时先触发自建 `onError(reason)` 回调再 `throw new Error(...)`；编码失败时扣减 `currentCount` 并同样上报。
  - 文本与附件在 `add()` 阶段即完成编码（图片为 data URL、文本为文件数据）并返回 `status: { type: "requires-action", reason: "composer-send" }`，`send()` 直接打包为 `CompleteAttachment`。
  - **错误通道与回滚差异**：Searcher 未通过 `useAuiEvent("composer.attachmentAddError", ...)` 统一订阅框架层事件，而是由 `SearcherAttachmentAdapter` 构造器回调驱动 `AttachmentErrorContext` 展示横幅错误；在 `onNew` 失败返回 `false` 时，`assistant-runtime.tsx` 手动调用 `runtime.thread.composer.setText(text)` 并遍历 `msg.attachments` 调用 `addAttachment(...)`（带 `try/catch` 吞掉回填异常，防止未捕获拒绝导致白屏）。

## 关联

- 实体：[assistant-ui Framework](/entities/assistant-ui-framework.md)、[Searcher 项目](/entities/searcher-项目.md)
- 概念：[ExternalStoreRuntime and Branchable Message Repository](/concepts/externalstoreruntime-and-branchable-message-repository.md)、[Upload Validation Defense in Depth](/concepts/upload-validation-defense-in-depth.md)
