---
type: entity
title: React 19 Framework
created: 2026-09-27
updated: 2026-10-24
---

# React 19 Framework

React 是 Searcher 前端采用的 UI 库；本页只汇集已捕获的状态、Effect 与 Action 契约，不代表对当前全部 React 19 API 的兼容性审计。

## 已有知识

- 状态关联渲染树中的组件位置，类型和 key 参与身份判定；切换 key 可显式重置状态。[状态保留来源](/sources/SRC-2026-09-25-015.md)、[原始摘录](../../raw/sources/SRC-2026-09-25-015/extracted.md) 19–23、921–925 行。
- Effect 用于同步外部系统；需要清理的资源在下次 Effect 执行前和卸载时释放。纯 props/state 派生通常不需要 Effect。[Effect 来源](/sources/SRC-2026-09-25-016.md)、[原始摘录](../../raw/sources/SRC-2026-09-25-016/extracted.md) 21–49、532–544 行。
- useActionState 提供 Action 结果、dispatch 与 pending；同一 Hook 的 dispatch 顺序执行。[Action 来源](/sources/SRC-2026-09-27-004.md)、[原始摘录](../../raw/sources/SRC-2026-09-27-004/extracted.md) 40–89 行。

## 关联

- [Actions 与 Transitions](/concepts/react-19-actions-and-transitions.md)
- [Searcher 架构](/syntheses/searcher-system-architecture.md)
