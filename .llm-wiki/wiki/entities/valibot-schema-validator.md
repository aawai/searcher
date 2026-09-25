---
type: entity
title: Valibot Schema Validator
created: 2026-09-25
updated: 2026-09-25
---

# Valibot Schema Validator

## 概述

**Valibot** 是由 Fabian Cook 等人开发的高性能、模块化、极小打包体积的 TypeScript
Schema 验证库。在 [[entities/searcher-项目]] 中，Valibot
充当所有网络边界（包括路由参数、查询字符串、请求体、环境变量）的数据门禁与类型系统基石。

## 核心特性与在 Searcher 中的应用

- **微模块摇树优化**：相比 Zod 拥有更小的打包体积与更快的执行性能，天然契合
  [[entities/deno-runtime]] 单进程轻量架构。
- **标准管道语法（Standard Pipe）**：支持 `v.pipe(v.string(), v.minLength(1))`
  等链式校验与类型转换。
- **统一信封错误格式化**：在 `src/internal/validator/` 基础设施中拦截 Valibot
  Issues，统一定制为规范的 400 业务错误信封响应，不泄露底层堆栈。
