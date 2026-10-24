---
type: concept
title: React 19 Actions and Transitions
domain: frontend
created: 2026-09-27
updated: 2026-10-24
sources:
  - sources/SRC-2026-09-27-004
---

# React 19 Actions and Transitions

React 19 把"由用户操作触发、可能异步的状态更新"统一为 Action：在 Transition 中执行，自动提供 pending 状态，并按序排队。

## Definition

- **Transition**：`startTransition` / `useTransition` 将更新标记为非紧急，渲染可被中断，旧 UI 在新状态就绪前保持可交互。
- **Action**：在 Transition 中运行的（可异步）函数。React 19 允许异步函数作为 Action。
- **`useActionState(reducerAction, initialState)`**：返回 `[state, dispatchAction, isPending]`；`reducerAction(prevState, payload)` 可异步、可有副作用；多次 `dispatchAction` 顺序执行，后一次收到前一次的结果，消除并发提交的乱序（[[sources/SRC-2026-09-27-004]]）。
- **表单集成**：`<form action={formAction}>` 支持渐进增强，提交后自动重置非受控输入。

## Searcher 现状

截至 2026-10-24，`web/src` 未使用 `useActionState`、`useTransition`、`startTransition`、`useOptimistic`（`grep` 结果为空）。异步请求的竞态由各 feature 自行处理，例如统一输入框对个人检索做防抖并中止过期请求（见 [[concepts/aria-combobox-grouped-suggestions]]）。引入 Action 时需注意：排队语义会让后发请求等待先发请求结算，不适用于"只要最新结果"的搜索联想，后者仍应使用 `AbortController`。

## Links

- [[entities/react-19-framework]]
- [[sources/SRC-2026-09-25-015]]
- [[sources/SRC-2026-09-25-016]]
