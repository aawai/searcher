---
type: concept
domain: engineering
title: Data Router Lifecycle in Searcher
created: 2026-11-07
updated: 2026-11-07
sources:
  - sources/SRC-2026-11-07-005
---

# Data Router Lifecycle in Searcher

## 来源契约

[createBrowserRouter](/sources/SRC-2026-11-07-005.md)：data router 不应放在 React state 中，应在 React 树外创建一次再交给 `<RouterProvider>`；v7 API 参考含同一句。完整路由树预先提供以便同步匹配，`route.lazy` / `patchRoutesOnNavigation` 用于延迟。

## Searcher 实现（2026-11-07 读码）

- `web/src/App.tsx` 第 543–598 行：`const [router] = useState(() => createBrowserRouter([...]))`，即**在 React state 中持有 router**，与来源约束不一致。
- 路由使用 `element` 而非 loader/action；唯一顶层路由包裹 `AppState`、`DockProvider`、`NavigationGuardProvider` 与 `Layout`，`*` 子路由渲染 `NotFoundPage`，与 AGENTS.md 中“由 React Router 决定页面与客户端 404”一致。注释说明使用 data router 是为了保留 `viewTransition` 等导航选项（第 557–558 行）。
- `web/src/main.tsx` 第 19–25 行在 `React.StrictMode` 下渲染 `<App />`。
- react-router 7.9.1 的 `createBrowserRouter` 在创建时立即调用 `.initialize()`，后者执行 `history.listen(...)`（`node_modules/.deno/react-router@7.9.1/.../chunk-B7RQU5TL.mjs` 第 8984、1113–1114 行）。

## 影响推断

React 文档说明 StrictMode 开发模式下会调用两次 `useState` 初始化函数并丢弃一次结果。结合上述代码，开发模式会创建两个 router，被丢弃的那个已订阅 `popstate` 且从未 `dispose()` [INFERENCE，未运行观察]。生产构建不重复调用初始化函数，因此不受影响；`App` 重新挂载时同样会再建 router。

符合来源的做法是把 router 提到模块作用域创建一次。这会改变测试中多次挂载 `App` 的隔离方式，是否调整由实现任务决定；本轮只记录，不改代码。

## 关联

- [Route-Level Code Splitting & Dynamic Bundling](/concepts/route-level-code-splitting-dynamic-bundling.md)
- [View Transitions Shared Element](/concepts/view-transitions-shared-element.md)
- [React 19 Framework](/entities/react-19-framework.md)
- [Searcher 项目](/entities/searcher-项目.md)
