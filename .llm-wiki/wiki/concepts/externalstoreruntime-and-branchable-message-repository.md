---
type: concept
domain: engineering
title: ExternalStoreRuntime and Branchable Message Repository
created: 2026-11-14
updated: 2026-11-14
sources:
  - sources/SRC-2026-11-14-001
  - sources/SRC-2026-11-14-002
  - sources/SRC-2026-11-14-003
  - sources/SRC-2026-11-14-006
---

# ExternalStoreRuntime and Branchable Message Repository

`ExternalStoreRuntime` 是 [[entities/assistant-ui-framework]] 中由宿主应用完全保有消息存储与持久化主权、仅将状态快照与操作回调接入对话 UI 的运行时模式；当对话存在编辑或重新生成分支时，需以 `ExportedMessageRepository` 替代扁平消息数组来表达父子指针与当前可见分支头（`headId`）。

## 官方契约

1. **能力矩阵由回调存在性决定**（[SRC-2026-11-14-001](/sources/SRC-2026-11-14-001.md)、[SRC-2026-11-14-003](/sources/SRC-2026-11-14-003.md)）：
   - `onNew`：开启发送新消息（必需）。
   - `setMessages`：开启分支切换，并告知 Runtime“由 Runtime 触发的消息移除（如取消运行移除尾部用户消息）会在下次快照中存活”。
   - `onEdit` / `onReload` / `onCancel`：分别启用消息编辑、重新生成与运行中止按钮。
   - `isDisabled` vs `isSendDisabled`：前者锁死整个线程（输入、附件、发送与编辑）；后者仅阻止主 composer 发送新消息，编辑已有消息的 composer 故意忽略该标志。
2. **分支树与 `ExportedMessageRepository`**（[SRC-2026-11-14-001](/sources/SRC-2026-11-14-001.md)、[SRC-2026-11-14-006](/sources/SRC-2026-11-14-006.md)）：
   - `ExportedMessageRepository.fromBranchableArray(items, { headId })` 要求每条消息有显式唯一 `id` 与 `parentId`；共享同一 `parentId` 的消息构成 `BranchPickerPrimitive` 可切换的兄弟分支，且数组顺序中父节点必须先于子节点出现。
   - `MessageRepository` 内部区分 `headId` 与 `canonicalHeadId` / `exportedHeadId()`，在离开分支时清理带 `metadata.isOptimistic` 的临时占位节点。
3. **消息转换与反查**（[SRC-2026-11-14-002](/sources/SRC-2026-11-14-002.md)）：
   - 可向 `useExternalStoreRuntime` 传入内联 `convertMessage`，或配合 `useExternalMessageConverter`（通过 `getMetadataKey` 避免无关元数据变化引发全量重转换）。
   - 组件层通过 `getExternalStoreMessages(s.message)` 反查原始宿主消息（返回 `T[]`，因为默认 `concat-content` 策略可合并相邻助手消息）。

## Searcher 实现与关键不变量（2026-11-14 读码与既有单测）

- **分支仓库构建与分支持久化**（`web/src/features/ask/assistant-runtime.tsx`）：
  - `SearcherAssistantRuntimeProvider` 将 `messages`（`AiMessageDto[]`）映射为 `{ message: convertAiMessageToThreadMessageLike(m), parentId: m.parentMessageId }`，传入 `ExportedMessageRepository.fromBranchableArray(items, { headId: activeLeafMessageId ?? null })`。
  - `setMessages` 读取 `selectedMessages.at(-1)?.id` 并回调 `onBranchChange(leafId)`，从而把 `BranchPickerPrimitive` 切换动作同步回宿主选中叶节点。
  - `onEdit` 取 `msg.sourceId || msg.parentId` 定位被编辑消息；`onReload` 在 `messages` 中查找 `role === "assistant" && m.parentMessageId === parentId` 以映射为需要重生成的目标消息 id。
- **不可破坏的状态转换不变量**（`web/src/features/ask/assistant-message-adapter.ts`、`assistant-message-adapter.test.ts`）：
  - 后端数据库为 `user` 与 `system` 消息同样存储 `status = "complete"`，但 `convertAiMessageToThreadMessageLike` **仅对 `msg.role === "assistant"` 设置 `status`**（`streaming` → `running`、`interrupted` → `incomplete/cancelled`、`failed` → `incomplete/error`、其余 → `complete/stop`），`user` 与 `system` 必须省略 `status`。
  - 既有单测 `assistant-message-adapter.test.ts` 证明：若保留 `user`/`system` 消息上的 `status`，`ExportedMessageRepository.fromBranchableArray` / `MessageRepository.import` 会直接抛出 `Error("status is only supported for assistant messages")`，导致前端渲染白屏。
  - 同时，适配器保留原始 DTO `id` 并把 `rawMessage`、模型/Provider/Token/分支字段写入 `metadata.custom`，确保兄弟分支可解析且 UI 可直接读取业务元信息（`assistant-message-adapter.ts` 仍以 `rawMessage` 传递原始数据，未走 `getExternalStoreMessages`）。

## 差异与注意点

- **父先于子约束**：官方契约要求 `fromBranchableArray` 输入中父节点先于子节点出现；Searcher 依赖后端/前端维护的 `messages` 时间或拓扑顺序，若未来引入乱序分页合并需显式保持父子序。
- **分支切换与 `unstable_onBranchChange`**：Searcher 当前直接利用稳定的 `setMessages(selectedMessages)` 取末条 id 回写 `activeLeafMessageId`，未依赖实验性 `unstable_onBranchChange`。

## 关联

- 实体：[assistant-ui Framework](/entities/assistant-ui-framework.md)、[Searcher 项目](/entities/searcher-项目.md)
- 概念：[Assistant UI Scoped Context and Attachment Adapter](/concepts/assistant-ui-scoped-context-and-attachment-adapter.md)、[OpenAI-Compatible Streaming and Tool Calls](/concepts/openai-compatible-streaming-and-tool-calls.md)、[AbortController and Request Cancellation](/concepts/abortcontroller-and-request-cancellation.md)

React Hook 的快照与订阅约束另见 [React External Store Snapshot Contract](/concepts/react-external-store-snapshot-contract.md)；两者属于不同接口，不据此推断 assistant-ui 的实现。
