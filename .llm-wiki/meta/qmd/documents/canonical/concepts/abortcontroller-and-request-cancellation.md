---
type: concept
title: AbortController and Request Cancellation in Searcher
domain: engineering
created: 2026-11-02
updated: 2026-11-02
sources:
  - sources/SRC-2026-11-02-002
---

# AbortController and Request Cancellation in Searcher

## 平台语义

[`AbortController`](/sources/SRC-2026-11-02-002.md)（[raw](../../raw/sources/SRC-2026-11-02-002/extracted.md) 第 197–224 行）：`signal` 传给异步操作，`abort()` 可中止 fetch、响应体消费与 streams。来源不涵盖错误类型与 `AbortSignal` 的其他 API。

## Searcher 的四种模式（2026-11-02 读码）

1. **Effect 清理 + 最新请求优先**（`useHomeCalm.ts` 第 50–82 行）：每次 `load` 先 `controller?.abort()` 再建新 controller；`then` 里还检查 `current.signal.aborted` 才写 state；`catch(() => {})` 吞掉取消；effect cleanup 再 abort 一次。`DocumentsSidebar.tsx`、`useAppSession.ts`（用 `Set<AbortController>` 在会话切换时批量取消）同类。
2. **用户可中止的流**（`useAskStream.ts` 第 481–484 行）：每次发送新建 controller，存入 `abortRef`；同时递增 `epochRef`，发布 state 前比对 epoch，避免旧流的残余数据覆盖新会话；`isAborted: controller.signal.aborted` 参与乐观快照。
3. **服务端流取消传播**（`ai.route.ts` 第 802–838 行）：`ReadableStream.cancel()`（客户端断开）→ `abortController.abort()` → 传入 `service.streamChat(…, signal)`。关键设计：被中止后**仍然继续 drain** 服务层的迭代器（注释“so interrupted output is persisted”）但不再 `enqueue`，也不 `close`；`catch` 里已中止则静默返回。即“取消 = 停止向客户端写入 + 通知上游停止”，而不是“立刻丢弃”。
4. **超时**（`webapp-icons/fetcher.ts` 第 143–200 行）：`setTimeout(() => controller.abort(), timeoutMs)`，`finally` 中清理定时器（读码确认 `finally` 存在，行号 198–200）；体积超限时用 `reader.cancel()` 或 `response.body.cancel()` 主动取消 body，避免连接留在读取态。该处没有用 `AbortSignal.timeout()`——来源未覆盖这个 API，本页不判断优劣。

## 一致的约定

- **取消不是错误**：所有调用点都把中止后的 reject 当作正常路径（吞掉或检查 `signal.aborted`）。依据是代码形态，而非规范文档。
- **“已中止”需要自己检查**：fetch 被 abort 之后，之前已排入微任务的回调仍会跑，所以 `then` 里必须再看 `signal.aborted`（`useHomeCalm`）或 epoch（`useAskStream`）。
- **一个 controller 对应一次操作**：controller 不复用，新操作新建（与来源“一个 signal 可用于多个操作”不冲突，项目选择了更简单的 1:1）。

## 未验证

- 客户端断开是否一定触发 `ReadableStream.cancel()`（取决于 Deno 与反向代理）；`X-Accel-Buffering: no` 的存在暗示了反向代理场景，未实测。`ai.route.test.ts` 第 641 行起有 `clientAbort` 用例，覆盖了该路径，本页未复述其断言。
- 被中止后继续 drain 上游迭代器是否会让 provider 仍在计费/生成，取决于 `streamChat` 是否把 signal 传给 provider SDK；未读取该实现。

## 关联

- [Server-Sent Events 与实时事件流](/concepts/server-sent-events-sse-与实时事件流.md)
- [React 19 Actions and Transitions](/concepts/react-19-actions-and-transitions.md)
- [ARIA Combobox Grouped Suggestions](/concepts/aria-combobox-grouped-suggestions.md)
