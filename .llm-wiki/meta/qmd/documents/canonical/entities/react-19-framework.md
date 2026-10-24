---
type: entity
title: React 19 Framework
category: tool
created: 2026-09-27
updated: 2026-10-24
sources:
  - sources/SRC-2026-09-25-015
  - sources/SRC-2026-09-25-016
  - sources/SRC-2026-09-27-004
---

# React 19 Framework

Searcher 前端的 UI 运行时，版本由 `deno.jsonc` 锁定为 `react@19.1.1` / `react-dom@19.1.1`，路由使用 `react-router-dom@7.9.1`。

## Overview

- **状态保留与重置**：状态绑定在渲染树位置上，同位置同类型组件保留状态，`key` 变化强制重置（[[sources/SRC-2026-09-25-015]]）。
- **Effect 同步与清理**：Effect 用于与外部系统同步，必须提供对称清理；开发模式双调用用于暴露缺失的清理（[[sources/SRC-2026-09-25-016]]）。
- **Actions / Transitions**：见 [[concepts/react-19-actions-and-transitions]]。

## Role in Searcher

- 入口 `web/src/App.tsx` 组装路由，`web/src/app/SearchHome.tsx` 组装首页与工作台；按路由 `React.lazy` 切分（[[concepts/route-level-code-splitting-dynamic-bundling]]）。
- 基础组件来自 [[entities/shadcn-ui-system]]，构建由 [[entities/vite-bundler]] 完成。
- 共享元素过渡在 React 状态更新外包裹 View Transition（[[concepts/view-transitions-shared-element]]）。

## Links

- [[entities/searcher-项目]]
- [[concepts/react-19-actions-and-transitions]]
