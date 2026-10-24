---
type: concept
title: React 19 Actions and Transitions
created: 2026-09-27
updated: 2026-10-24
---

# React 19 Actions and Transitions

`useActionState` 把 Action 的副作用结果与组件状态关联，并提供 pending 状态；它不是对所有异步请求的全局调度或竞态消除器。

## 已捕获契约

- 返回 `[state, dispatchAction, isPending]`，Action 接收前次 state 和 payload，返回新 state。
- 同一 Hook 的多次 dispatch 按顺序执行，后一次接收前一次结果；不能由此推导跨 Hook、跨页面或其他请求不再存在竞态。
- dispatch 必须位于 Action 中，可由 startTransition 或 Action prop 提供上下文；不能将普通事件回调的任意异步调用自动视为 Transition。
- permalink 的渐进增强说明面向 Server Function 和 React Server Components 场景，不应直接视为普通 SPA 已具备的能力。

依据：[useActionState 来源](/sources/SRC-2026-09-27-004.md)；[原始摘录](../../raw/sources/SRC-2026-09-27-004/extracted.md) 40–89 行。这里只覆盖已捕获的 useActionState 契约，不把它扩展成所有 Transition API 的完整说明。

## 关联

- [React 实体](/entities/react-19-framework.md)
- [契约优先测试](/concepts/contract-first-testing.md)
