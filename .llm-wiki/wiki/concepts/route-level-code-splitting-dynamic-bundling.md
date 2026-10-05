---
type: concept
title: Route-Level Code Splitting & Dynamic Bundling
domain: engineering
created: 2026-10-05
updated: 2026-10-05
sources: [sources/SRC-2026-10-05-001, sources/SRC-2026-10-05-002]
---

# Route-Level Code Splitting & Dynamic Bundling

按路由与功能生命周期边界对前端应用进行动态切分，使首屏仅下载关键路径代码，异步功能按需懒加载并受 CI 预算门禁约束的工程架构模式。

## Definition

在单页应用（SPA）中，所有页面若通过静态 `import` 引用，打包工具会将非首屏页面及独占的重量级第三方依赖（如富文本/Markdown 编辑器、AI 交互组件、图表分析库）全部打包进初始静态图。这会导致初始 JS 体积过大，显著拖累首次内容绘制（FCP）与最大内容绘制（LCP）。

路由级代码切分（Route-Level Code Splitting）通过以下核心原则解决该问题：
1. **静态主入口收敛**：仅保持应用外壳（App Shell）与核心首页（如 SearchHome）在初始静态闭包中加载。
2. **动态路由切分**：非首页路由全部通过 `React.lazy(() => import(...))` 进行声明，生成独立的动态 entry chunk。
3. **隔离重库依赖**：生命周期与特定页面绑定的三方库（如 Ask 路由独占的 `@assistant-ui/react`）不得通过顶层 vendor 配置提前拖入初始静态闭包。
4. **Suspense 与容错保护**：使用 `Suspense` 包裹路由内容并提供轻量无障碍 fallback（`aria-busy="true"`），配合 `RouteErrorBoundary` 在动态 chunk 404 或网络故障时提供非无限重试的明确恢复路径。
5. **自动化 Budget 门禁**：基于构建产物 manifest 提取 canonical initial static graph，在 CI 中对 Raw Bytes、Gzip Bytes 与相对基线降幅施加硬性门禁。

## Implementation in Searcher

在 Searcher 项目（Issue #117）中：
- 首页初始静态 JS 降至 778.6 kB raw / 242.7 kB gzip，相对基线实现 44.77% 压缩体积削减；
- `AskPage`、`SettingsPage`、`AdminPage` 等路由全量懒加载；
- `NoteMarkdownLoader` 将便签卡片与编辑器的 Markdown 渲染器转为按需异步加载；
- 配合 `scripts/check-bundle.ts` 与 `.github/workflows/bundle-guard.yml` 构筑防劣化门禁。

## Links

- [Vite Bundler](/entities/vite-bundler.md)
- [React 19 Framework](/entities/react-19-framework.md)
- [Searcher 项目](/entities/searcher-项目.md)
- [Vite - Code Splitting Strategy](/sources/SRC-2026-10-05-001.md)
- [Taming 'Large Chunks' in Vite + React](/sources/SRC-2026-10-05-002.md)
