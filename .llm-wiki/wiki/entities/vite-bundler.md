---
type: entity
category: tool
title: Vite Bundler
created: 2026-10-05
updated: 2026-10-05
sources: [sources/SRC-2026-10-05-001, sources/SRC-2026-10-05-002]
---

# Vite Bundler

基于原生 ES 模块（开发期）与 Rollup/Rolldown（生产构建期）的下一代现代前端构建工具与开发服务器。

## Overview

Vite 在开发环境下利用浏览器原生 ESM 支持与 ESBuild 预打包实现毫秒级热更新，在生产环境下利用 Rollup 进行多 chunk 打包、Tree-shaking、代码混淆以及模块预加载优化（modulepreload）。

## Role in Searcher

在 Searcher 项目中：
- 驱动前端 React 应用的开发与生产构建；
- 配合 `@deno/vite-plugin` 实现 Deno 与 Vite 的原生集成；
- 通过 `build.manifest: 'manifest.json'` 输出精确的 chunk 依赖映射图谱；
- 采用函数式 `manualChunks` 精细隔离 `react-vendor`、`ui-vendor`，使路由独占依赖按需加载。

## Links

- [Route-Level Code Splitting & Dynamic Bundling](/concepts/route-level-code-splitting-dynamic-bundling.md)
- [React 19 Framework](/entities/react-19-framework.md)
- [Searcher 项目](/entities/searcher-项目.md)
- [Vite - Code Splitting Strategy](/sources/SRC-2026-10-05-001.md)
- [Taming 'Large Chunks' in Vite + React](/sources/SRC-2026-10-05-002.md)
